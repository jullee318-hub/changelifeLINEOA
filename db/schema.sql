CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  stage TEXT DEFAULT 'catch',
  first_message_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  is_blocked INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  direction TEXT NOT NULL,
  source TEXT,
  content TEXT NOT NULL,
  line_message_id TEXT,
  sent_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  trigger_message_id INTEGER REFERENCES messages(id),
  ai_content TEXT NOT NULL,
  edited_content TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS operators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_line_id ON contacts(line_user_id);

CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'all',
  target_stage TEXT,
  contact_ids TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status, scheduled_at);

INSERT OR IGNORE INTO settings (key, value) VALUES ('reply_mode', 'semi-auto');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_model', 'claude-haiku-4-5-20251001');
INSERT OR IGNORE INTO settings (key, value) VALUES ('courses', '[{"name":"人生轉換術","description":"透過深層信念轉換，重新改寫你的人生劇本，找到內在真正的力量與方向","price":"","schedule":"","link":"","note":"","active":true},{"name":"元辰宮療癒師培訓班","description":"學會精準剖析元辰宮，結合阿卡西紀錄解讀，成為專業的元辰宮療癒師","price":"","schedule":"","link":"","note":"","active":true},{"name":"靈魂覺醒","description":"透過能量校準與深層覺察，喚醒你靈魂深處的記憶與天賦，活出真正的自己","price":"","schedule":"","link":"","note":"","active":true}]');
