#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <AVFoundation/AVFoundation.h>
#import <Vision/Vision.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <QuartzCore/QuartzCore.h>
#import <ImageIO/ImageIO.h>

typedef void (*ScanCallback)(const char *text, double elapsed_ms, const char *format, const char *error);

static ScanCallback g_callback = NULL;

static void Emit(NSString *text, double ms, NSString *format, NSString *error) {
    if (!g_callback) return;
    const char *payload = text.UTF8String ?: "";
    const char *symbology = format.UTF8String ?: "";
    const char *message = error.UTF8String ?: "";
    g_callback(payload, ms, symbology, message);
}

@interface VisionScanner : NSObject <AVCaptureVideoDataOutputSampleBufferDelegate>
@property(nonatomic, strong) dispatch_queue_t sessionQueue;
@property(nonatomic, strong) AVCaptureSession *session;
@property(nonatomic, strong) NSPanel *panel;
@property(nonatomic, strong) NSTextField *status;
@property(nonatomic, copy) NSString *lastPayload;
@property(nonatomic, copy) NSString *pendingPayload;
@property(nonatomic) CFAbsoluteTime lastAt;
@property(nonatomic) CFAbsoluteTime pendingAt;
@property(nonatomic) BOOL running;
@property(nonatomic) BOOL stopping;
@property(nonatomic) BOOL delivered;
@property(nonatomic) BOOL continuous;
@end

@implementation VisionScanner

- (instancetype)init {
    self = [super init];
    if (self) {
        _sessionQueue = dispatch_queue_create("com.inventariopro.scanner", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (void)startContinuous:(BOOL)continuous {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self stop];
        self.running = YES;
        self.stopping = NO;
        self.delivered = NO;
        self.continuous = continuous;
        self.lastPayload = nil;
        self.pendingPayload = nil;
        self.lastAt = 0;
        self.pendingAt = 0;

        AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
        if (status == AVAuthorizationStatusNotDetermined) {
            [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (!self.running) return;
                    if (!granted) {
                        Emit(nil, 0, nil, @"Permiso de cámara denegado");
                        [self stop];
                        return;
                    }
                    [self configureSession];
                });
            }];
            return;
        }
        if (status != AVAuthorizationStatusAuthorized) {
            Emit(nil, 0, nil, @"Permiso de cámara denegado");
            [self stop];
            return;
        }
        [self configureSession];
    });
}

- (void)configureSession {
    dispatch_async(self.sessionQueue, ^{
        NSError *error = nil;
        AVCaptureSession *session = [self buildSession:&error];
        if (!session) {
            NSString *message = error.localizedDescription ?: @"No se pudo abrir la cámara";
            dispatch_async(dispatch_get_main_queue(), ^{
                Emit(nil, 0, nil, message);
                [self stop];
            });
            return;
        }
        self.session = session;
        if (self.running) [session startRunning];
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!self.running) {
                dispatch_async(self.sessionQueue, ^{
                    if (session.isRunning) [session stopRunning];
                });
                return;
            }
            [self presentPanel:session];
        });
    });
}

- (AVCaptureSession *)buildSession:(NSError **)error {
    AVCaptureDevice *device = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo];
    if (!device) {
        if (error) *error = [NSError errorWithDomain:@"InventarioPro" code:2 userInfo:@{NSLocalizedDescriptionKey: @"No hay cámara disponible"}];
        return nil;
    }
    AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:error];
    if (!input) return nil;

    AVCaptureSession *session = [[AVCaptureSession alloc] init];
    session.sessionPreset = AVCaptureSessionPreset1280x720;
    [session beginConfiguration];
    if ([session canAddInput:input]) [session addInput:input];
    AVCaptureVideoDataOutput *output = [[AVCaptureVideoDataOutput alloc] init];
    output.alwaysDiscardsLateVideoFrames = YES;
    output.videoSettings = @{
        (NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)
    };
    [output setSampleBufferDelegate:self queue:self.sessionQueue];
    if ([session canAddOutput:output]) [session addOutput:output];
    [session commitConfiguration];
    return session;
}

- (void)presentPanel:(AVCaptureSession *)session {
    NSPanel *panel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, 760, 560)
                                                 styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskUtilityWindow)
                                                   backing:NSBackingStoreBuffered
                                                     defer:NO];
    panel.title = @"Escanear código";
    panel.level = NSFloatingWindowLevel;
    panel.collectionBehavior = NSWindowCollectionBehaviorMoveToActiveSpace | NSWindowCollectionBehaviorFullScreenAuxiliary;
    NSView *content = panel.contentView;
    content.wantsLayer = YES;
    content.layer.backgroundColor = NSColor.blackColor.CGColor;

    NSView *videoHost = [[NSView alloc] initWithFrame:NSMakeRect(0, 44, 760, 516)];
    videoHost.wantsLayer = YES;
    AVCaptureVideoPreviewLayer *preview = [AVCaptureVideoPreviewLayer layerWithSession:session];
    preview.frame = videoHost.bounds;
    preview.videoGravity = AVLayerVideoGravityResizeAspectFill;
    preview.autoresizingMask = kCALayerWidthSizable | kCALayerHeightSizable;
    [videoHost.layer addSublayer:preview];
    [content addSubview:videoHost];

    NSTextField *status = [[NSTextField alloc] initWithFrame:NSMakeRect(16, 10, 728, 24)];
    status.editable = NO;
    status.bezeled = NO;
    status.drawsBackground = NO;
    status.textColor = NSColor.whiteColor;
    status.stringValue = @"Apple Vision · apunta al código";
    [content addSubview:status];
    self.status = status;
    self.panel = panel;

    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(windowWillClose:) name:NSWindowWillCloseNotification object:panel];
    [panel center];
    [NSApp activateIgnoringOtherApps:YES];
    [panel makeKeyAndOrderFront:nil];
}

- (void)windowWillClose:(NSNotification *)note {
    (void)note;
    if (self.stopping) return;
    if (self.running && !self.delivered) Emit(nil, 0, nil, @"cancelled");
    [self stop];
}

- (void)stop {
    if (self.stopping) return;
    self.stopping = YES;
    self.running = NO;
    AVCaptureSession *session = self.session;
    self.session = nil;
    if (session) {
        dispatch_async(self.sessionQueue, ^{
            if (session.isRunning) [session stopRunning];
        });
    }
    if (self.panel) {
        NSPanel *panel = self.panel;
        self.panel = nil;
        [[NSNotificationCenter defaultCenter] removeObserver:self name:NSWindowWillCloseNotification object:panel];
        [panel close];
    }
    self.stopping = NO;
}

- (void)captureOutput:(AVCaptureOutput *)output
didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
       fromConnection:(AVCaptureConnection *)connection {
    (void)output;
    (void)connection;
    if (!self.running) return;
    CVImageBufferRef buffer = CMSampleBufferGetImageBuffer(sampleBuffer);
    if (!buffer) return;

    VNDetectBarcodesRequest *request = [[VNDetectBarcodesRequest alloc] init];
    request.symbologies = @[
        VNBarcodeSymbologyQR,
        VNBarcodeSymbologyMicroQR,
        VNBarcodeSymbologyEAN13,
        VNBarcodeSymbologyEAN8,
        VNBarcodeSymbologyCode128,
        VNBarcodeSymbologyCode39,
        VNBarcodeSymbologyCode93,
        VNBarcodeSymbologyUPCE,
        VNBarcodeSymbologyITF14,
        VNBarcodeSymbologyPDF417,
        VNBarcodeSymbologyDataMatrix,
        VNBarcodeSymbologyAztec
    ];
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCVPixelBuffer:buffer
                                                                                orientation:kCGImagePropertyOrientationUp
                                                                                    options:@{}];
    CFAbsoluteTime started = CFAbsoluteTimeGetCurrent();
    NSError *error = nil;
    BOOL ok = [handler performRequests:@[request] error:&error];
    double elapsed = (CFAbsoluteTimeGetCurrent() - started) * 1000.0;
    if (!ok || !self.running) return;

    for (id item in request.results) {
        if (![item isKindOfClass:[VNBarcodeObservation class]]) continue;
        VNBarcodeObservation *observation = item;
        NSString *payload = observation.payloadStringValue;
        if (payload.length == 0) continue;
        CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
        if (self.lastPayload && [self.lastPayload isEqualToString:payload] && (now - self.lastAt) < 1.5) return;
        if (![payload isEqualToString:self.pendingPayload] || (now - self.pendingAt) > 0.45) {
            self.pendingPayload = payload;
            self.pendingAt = now;
            continue;
        }
        self.lastPayload = payload;
        self.lastAt = now;
        self.pendingPayload = nil;
        NSString *symbology = observation.symbology ?: @"";
        BOOL continuous = self.continuous;
        self.delivered = YES;
        Emit(payload, elapsed, symbology, nil);
        dispatch_async(dispatch_get_main_queue(), ^{
            if (self.status) {
                self.status.stringValue = [NSString stringWithFormat:@"Vision · %@ · %.1f ms", payload, elapsed];
            }
            if (!continuous) [self stop];
        });
        break;
    }
}

@end

static VisionScanner *SharedScanner(void) {
    static VisionScanner *scanner;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        scanner = [VisionScanner new];
    });
    return scanner;
}

int vision_scan_start(int continuous, ScanCallback callback) {
    g_callback = callback;
    [SharedScanner() startContinuous:continuous ? YES : NO];
    return 0;
}

void vision_scan_stop(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        [SharedScanner() stop];
    });
}
