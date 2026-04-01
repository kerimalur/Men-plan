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

DROP POLICY IF EXISTS "allow_all" ON settings;
DROP POLICY IF EXISTS "allow_all" ON day_markers;
CREATE POLICY "allow_all" ON settings    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON day_markers FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Stückzahl-Einheit: 'stk' zu allen unit-Constraints hinzufügen
-- ============================================================

-- foods.unit: 'g', 'ml' → + 'stk'
ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_unit_check;
ALTER TABLE foods ADD CONSTRAINT foods_unit_check CHECK (unit IN ('g', 'ml', 'stk'));

-- meal_template_items.unit: + 'stk'
ALTER TABLE meal_template_items DROP CONSTRAINT IF EXISTS meal_template_items_unit_check;
ALTER TABLE meal_template_items ADD CONSTRAINT meal_template_items_unit_check CHECK (unit IN ('g', 'ml', 'dl', 'l', 'stk'));

-- meal_items.unit: + 'stk'
ALTER TABLE meal_items DROP CONSTRAINT IF EXISTS meal_items_unit_check;
ALTER TABLE meal_items ADD CONSTRAINT meal_items_unit_check CHECK (unit IN ('g', 'ml', 'dl', 'l', 'stk'));

-- ============================================================
-- Import-Funktion: Eindeutiger Name in foods (Upsert-Voraussetzung)
-- ============================================================

-- Doppelte Namen zuerst bereinigen (behält jeweils den ältesten Eintrag)
DELETE FROM foods f1
USING foods f2
WHERE f1.name = f2.name
  AND f1.created_at > f2.created_at;

-- Eindeutigkeits-Constraint für Upsert ON CONFLICT (name)
ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_name_unique;
ALTER TABLE foods ADD CONSTRAINT foods_name_unique UNIQUE (name);

-- ============================================================
-- Eigene Lebensmittel: food_id in meal_items ist bereits nullable
-- (ON DELETE SET NULL). Custom-Foods haben food_id = NULL und
-- werden über food_name getrackt.
-- ============================================================

-- ============================================================
-- Tages- und Wochenplan-Vorlagen
-- ============================================================

-- Übergeordnete Vorlage (Tag oder Woche)
CREATE TABLE IF NOT EXISTS plan_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('day', 'week')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tage innerhalb einer Vorlage
-- day_offset = 0 für Tagesvorlage, 0-6 für Wochenplan (Mo-So)
CREATE TABLE IF NOT EXISTS plan_template_days (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES plan_templates(id) ON DELETE CASCADE,
  day_offset  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Mahlzeiten innerhalb eines Vorlagentages
CREATE TABLE IF NOT EXISTS plan_template_meals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_day_id UUID REFERENCES plan_template_days(id) ON DELETE CASCADE,
  meal_type       TEXT NOT NULL CHECK (meal_type IN ('fruehstueck', 'mittagessen', 'abendessen', 'snack')),
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Zutaten einer Vorlagen-Mahlzeit (Snapshot wie bei meal_items)
CREATE TABLE IF NOT EXISTS plan_template_items (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_meal_id UUID REFERENCES plan_template_meals(id) ON DELETE CASCADE,
  food_id          UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name        TEXT NOT NULL,
  amount           DECIMAL(8,2) NOT NULL,
  unit             TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'dl', 'l', 'stk')),
  kcal             DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein          DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost             DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE plan_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_template_days  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_template_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON plan_templates;
DROP POLICY IF EXISTS "allow_all" ON plan_template_days;
DROP POLICY IF EXISTS "allow_all" ON plan_template_meals;
DROP POLICY IF EXISTS "allow_all" ON plan_template_items;
CREATE POLICY "allow_all" ON plan_templates      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON plan_template_days  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON plan_template_meals FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON plan_template_items FOR ALL TO anon USING (true) WITH CHECK (true);
