CREATE TABLE IF NOT EXISTS cafe24_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  mall_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  refresh_token_expires_at INTEGER NOT NULL,
  scope TEXT,
  user_id TEXT,
  shop_no INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tenant_id, mall_id)
);
CREATE INDEX IF NOT EXISTS idx_cafe24_tokens_tenant ON cafe24_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cafe24_tokens_mall ON cafe24_tokens(mall_id);
