-- Leads captured by the email capture and the contact form.
-- Applied with: npx wrangler d1 migrations apply legroom-leads --remote

CREATE TABLE IF NOT EXISTS leads (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  name        TEXT,
  message     TEXT,
  source      TEXT NOT NULL DEFAULT 'unknown',
  user_agent  TEXT,
  created_at  TEXT NOT NULL
);

-- newest first, which is the only way anyone reads this table
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);

-- one person can send more than one note, so this is not unique; it is here so
-- "has this address been in touch before" stays a fast lookup
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
