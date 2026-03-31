-- ============================================================
-- Menüplan – Schema Update (in Supabase SQL-Editor ausführen)
-- ============================================================

-- Einstellungen (Ziele etc.)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES ('kcal_ziel',    '2000') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('protein_ziel', '150')  ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('kosten_ziel',  '20')   ON CONFLICT (key) DO NOTHING;

-- Tagesmarkierungen (Training / Eingeladen) – unabhängig von Mahlzeiten
CREATE TABLE IF NOT EXISTS day_markers (
  date       DATE PRIMARY KEY,
  training   BOOLEAN DEFAULT FALSE,
  eingeladen BOOLEAN DEFAULT FALSE,
  notiz      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON settings    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON day_markers FOR ALL TO anon USING (true) WITH CHECK (true);
