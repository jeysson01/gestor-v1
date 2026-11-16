use std::process::Command;

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").ok().as_deref() == Some("macos") {
        compile_vision_scanner();
    }
    tauri_build::build();
}

fn compile_vision_scanner() {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let out = std::env::var("OUT_DIR").unwrap();
    let sdk_out = Command::new("xcrun")
        .args(["--sdk", "macosx", "--show-sdk-path"])
        .output()
        .expect("xcrun");
    if !sdk_out.status.success() {
        panic!("No se pudo localizar el SDK de macOS");
    }
    let sdk = String::from_utf8(sdk_out.stdout).unwrap();
    let sdk = sdk.trim();
    let source = format!("{manifest}/native/macos/Scanner.m");
    let object = format!("{out}/scanner.o");
    let status = Command::new("xcrun")
        .args([
            "--sdk",
            "macosx",
            "clang",
            "-fobjc-arc",
            "-mmacosx-version-min=12.0",
            "-isysroot",
            sdk,
            "-c",
            &source,
            "-o",
            &object,
        ])
        .status()
        .expect("clang");
    if !status.success() {
        panic!("No se pudo compilar el escáner Apple Vision");
    }
    let library = format!("{out}/libvisionscanner.a");
    let status = Command::new("xcrun")
        .args(["--sdk", "macosx", "libtool", "-static", "-o", &library, &object])
        .status()
        .expect("libtool");
    if !status.success() {
        panic!("No se pudo archivar el escáner Apple Vision");
    }
    println!("cargo:rustc-link-search=native={out}");
    println!("cargo:rustc-link-lib=static=visionscanner");
    println!("cargo:rustc-link-lib=dylib=objc");
    for framework in [
        "Foundation",
        "AppKit",
        "AVFoundation",
        "Vision",
        "CoreMedia",
        "CoreVideo",
        "QuartzCore",
        "ImageIO",
        "CoreGraphics",
    ] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    println!("cargo:rerun-if-changed=native/macos/Scanner.m");
}
