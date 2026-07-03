-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role INTEGER NOT NULL DEFAULT 1, -- 1=viewer, 4=admin
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User keys (password hashes, etc.)
CREATE TABLE user_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind INTEGER NOT NULL, -- 1=password
  identification TEXT NOT NULL, -- email
  secret TEXT NOT NULL, -- hash
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_user_keys_identification ON user_keys(identification);
CREATE INDEX idx_user_keys_user_id ON user_keys(user_id);

-- User sessions
CREATE TABLE user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_id INTEGER NOT NULL REFERENCES user_keys(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1, -- 1=active, 2=expired, 3=signed_out
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_token ON user_sessions(token);
CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);

-- Server credentials (Radicale)
CREATE TABLE server_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Radicale',
  server_type INTEGER NOT NULL DEFAULT 1, -- 1=Radicale
  base_url TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL, -- encrypted AES-GCM
  calendar_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_servers_user_id ON server_credentials(user_id);
