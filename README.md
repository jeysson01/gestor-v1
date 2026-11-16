# Inventario Pro

Aplicación de inventario para Mac (`.dmg`) y, con el mismo proyecto Tauri 2, un paquete iOS (`.ipa`). Los datos se guardan al instante en SQLite. Si configuras Supabase, los cambios pendientes se envían al volver la conexión.

## Requisitos

- Node.js 22 o superior
- Rust 1.90 o superior (`rustup`)
- Xcode 15 o superior, con las herramientas de línea de comandos
- Para el `.ipa`: el certificado **Apple Development** ya presente en este Mac y el equipo `J7YZ2Z7842` dentro de `src-tauri/tauri.conf.json`. El iPhone debe estar registrado en ese equipo.

```bash
xcode-select --install
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
cd Gestor-v1
npm install
```

## Supabase

1. Crea un proyecto en Supabase.
2. En Authentication crea el usuario administrador (correo y contraseña).
3. Ejecuta `supabase/migrations/20261103210000_inventory_init.sql` en el SQL Editor.
4. Copia `.env.example` a `.env` y completa solo la URL y la clave **anon**:

```
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon
```

Sin esas variables la app entra con `admin@inventario.pro` / `admin123` y guarda todo en el equipo. No pongas la clave `service_role` en el cliente.

## Escritorio Mac (.dmg)

```bash
npm run desktop:dev
npm run desktop:dmg
```

El instalador queda en:

`src-tauri/target/release/bundle/dmg/Inventario Pro_1.0.0_aarch64.dmg`

La primera compilación descarga las crates y puede tardar varios minutos. El paquete se firma con el certificado de desarrollo de este Mac. Para distribuirlo fuera de tus equipos hace falta un certificado **Developer ID Application** y notarización (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`).

La cámara pide permiso la primera vez (`NSCameraUsageDescription`). El escaneo en vivo usa Apple Vision sobre AVFoundation. Una imagen suelta se decodifica con rxing (ZXing) desde el Kiosko.

## iPhone (.ipa)

```bash
npm run ios:init
npm run ios:dev
npm run ios:ipa
```

`ios:ipa` equivale a `tauri ios build` y usa el equipo `J7YZ2Z7842`. Xcode crea el perfil de aprovisionamiento de desarrollo si la cuenta de Apple está iniciada en Xcode (Settings → Accounts). El `.ipa` de desarrollo solo se instala en dispositivos registrados en ese equipo. Para App Store o TestFlight hace falta un perfil de distribución y `--export-method app-store-connect`.

En iPhone el botón Cámara y el Kiosko usan VisionKit (`@tauri-apps/plugin-barcode-scanner`), con la vista de la cámara detrás de la interfaz.
