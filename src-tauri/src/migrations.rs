use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        mig(1, "products", "CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            unit_price REAL NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        )"),
        mig(2, "products_code", "CREATE UNIQUE INDEX IF NOT EXISTS products_code_active ON products(code) WHERE deleted_at IS NULL"),
        mig(3, "purchases", "CREATE TABLE IF NOT EXISTS purchases (
            id TEXT PRIMARY KEY,
            number TEXT NOT NULL,
            purchased_at TEXT NOT NULL,
            supplier TEXT NOT NULL DEFAULT '',
            yape TEXT NOT NULL DEFAULT '',
            total REAL NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        )"),
        mig(4, "purchase_items", "CREATE TABLE IF NOT EXISTS purchase_items (
            id TEXT PRIMARY KEY,
            purchase_id TEXT NOT NULL,
            product_id TEXT,
            code TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL DEFAULT '',
            quantity REAL NOT NULL,
            unit_price REAL NOT NULL,
            subtotal REAL NOT NULL
        )"),
        mig(5, "purchase_items_idx", "CREATE INDEX IF NOT EXISTS purchase_items_purchase ON purchase_items(purchase_id)"),
        mig(6, "outbox", "CREATE TABLE IF NOT EXISTS sync_outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )"),
        mig(7, "outbox_idx", "CREATE INDEX IF NOT EXISTS sync_outbox_entity ON sync_outbox(entity, entity_id)"),
        mig(8, "meta", "CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )"),
    ]
}

fn mig(version: i64, description: &'static str, sql: &'static str) -> Migration {
    Migration {
        version,
        description,
        sql,
        kind: MigrationKind::Up,
    }
}
