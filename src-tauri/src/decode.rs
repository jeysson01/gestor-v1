use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanHit {
    pub text: String,
    pub format: String,
    pub elapsed_ms: f64,
    pub engine: &'static str,
}

pub fn decode_image_bytes(bytes: Vec<u8>) -> Result<ScanHit, String> {
    let image = image::load_from_memory(&bytes).map_err(|error| format!("Imagen no válida: {error}"))?;
    let image = if image.width() > 1600 {
        let height = ((image.height() as f32) * (1600.0 / image.width() as f32)).round() as u32;
        image.resize(1600, height.max(1), image::imageops::FilterType::Triangle)
    } else {
        image
    };
    let gray = image.to_luma8();
    let (width, height) = gray.dimensions();
    let started = std::time::Instant::now();
    let result = rxing::helpers::detect_in_luma(gray.into_raw(), width, height, None)
        .map_err(|error| format!("No se encontró un código: {error:?}"))?;
    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
    Ok(ScanHit {
        text: result.getText().to_string(),
        format: format!("{:?}", result.getBarcodeFormat()),
        elapsed_ms,
        engine: "rxing",
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn decodes_qr_quickly() {
        let (luma, width, height) = qr_image("P-001");
        let started = std::time::Instant::now();
        let text = decode_luma_qr(luma, width, height).expect("qr");
        let elapsed = started.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(text, "P-001");
        eprintln!("rxing QR {elapsed:.2} ms");
        assert!(elapsed < 500.0, "decodificación lenta: {elapsed:.2} ms");
    }

    fn decode_luma_qr(luma: Vec<u8>, width: u32, height: u32) -> Result<String, String> {
        let result = rxing::helpers::detect_in_luma(luma, width, height, Some(rxing::BarcodeFormat::QR_CODE))
            .map_err(|error| format!("{error:?}"))?;
        Ok(result.getText().to_string())
    }

    fn qr_image(text: &str) -> (Vec<u8>, u32, u32) {
        let code = qrcode::QrCode::new(text.as_bytes()).expect("qr");
        let size = code.width();
        let scale = 8usize;
        let quiet = 4usize;
        let dim = (size + quiet * 2) * scale;
        let mut luma = vec![255u8; dim * dim];
        for y in 0..size {
            for x in 0..size {
                if code[(x, y)] != qrcode::Color::Dark {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        let px = (x + quiet) * scale + dx;
                        let py = (y + quiet) * scale + dy;
                        luma[py * dim + px] = 0;
                    }
                }
            }
        }
        (luma, dim as u32, dim as u32)
    }
}
