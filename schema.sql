-- ============================================================
-- Menüplan – Komplettes Supabase Schema (idempotent)
-- Kann beliebig oft im SQL-Editor eingefügt werden
-- ============================================================

-- ============================================================
-- 1. Tabellen erstellen
-- ============================================================

CREATE TABLE IF NOT EXISTS food_categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS foods (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  calories_per_100 DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_per_100  DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost_per_100     DECIMAL(8,4) NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL DEFAULT 'g',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meal_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  meal_type  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meal_template_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES meal_templates(id) ON DELETE CASCADE,
  food_id     UUID REFERENCES foods(id) ON DELETE CASCADE,
  amount      DECIMAL(8,2) NOT NULL,
  unit        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meal_plans (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date           DATE NOT NULL UNIQUE,
  kcal_total     DECIMAL(8,2) DEFAULT 0,
  protein_total  DECIMAL(8,2) DEFAULT 0,
  cost_total     DECIMAL(8,4) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meals (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id        UUID REFERENCES meal_plans(id) ON DELETE CASCADE,
  meal_type      TEXT NOT NULL,
  name           TEXT NOT NULL,
  kcal_total     DECIMAL(8,2) DEFAULT 0,
  protein_total  DECIMAL(8,2) DEFAULT 0,
  cost_total     DECIMAL(8,4) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meal_items (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_id    UUID REFERENCES meals(id) ON DELETE CASCADE,
  food_id    UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name  TEXT NOT NULL,
  amount     DECIMAL(8,2) NOT NULL,
  unit       TEXT NOT NULL,
  kcal       DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein    DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost       DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_list (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item       TEXT NOT NULL,
  quantity   TEXT,
  checked    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS day_markers (
  date       DATE PRIMARY KEY,
  training   BOOLEAN DEFAULT FALSE,
  eingeladen BOOLEAN DEFAULT FALSE,
  notiz      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('day', 'week')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_template_days (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES plan_templates(id) ON DELETE CASCADE,
  day_offset  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_template_meals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_day_id UUID REFERENCES plan_template_days(id) ON DELETE CASCADE,
  meal_type       TEXT NOT NULL CHECK (meal_type IN ('fruehstueck', 'mittagessen', 'abendessen', 'snack')),
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS event_meal_rules (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type  TEXT NOT NULL CHECK (event_type IN ('training', 'eingeladen')),
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('fruehstueck', 'mittagessen', 'abendessen', 'snack')),
  template_id UUID NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  freetext   TEXT DEFAULT '',
  meal_type  TEXT CHECK (meal_type IN ('fruehstueck', 'mittagessen', 'abendessen', 'snack')),
  status     TEXT DEFAULT 'idee' CHECK (status IN ('idee', 'zutaten_erfasst', 'bereit')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS note_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id     UUID REFERENCES notes(id) ON DELETE CASCADE,
  food_id     UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name   TEXT NOT NULL,
  amount      DECIMAL(8,2),
  unit        TEXT DEFAULT 'g' CHECK (unit IN ('g', 'ml', 'dl', 'l', 'stk')),
  is_resolved BOOLEAN DEFAULT FALSE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Spalten hinzufügen (IF NOT EXISTS)
-- ============================================================

ALTER TABLE foods ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES food_categories(id) ON DELETE SET NULL;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS calories_per_100g DECIMAL(8,2);
ALTER TABLE foods ADD COLUMN IF NOT EXISTS protein_per_100g DECIMAL(8,2);

ALTER TABLE meals ADD COLUMN IF NOT EXISTS eaten BOOLEAN DEFAULT FALSE;
ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS category TEXT;

-- ============================================================
-- 3. CHECK-Constraints aktualisieren (drop + create)
-- ============================================================

ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_unit_check;
ALTER TABLE foods ADD CONSTRAINT foods_unit_check CHECK (unit IN ('g', 'ml', 'stk'));

ALTER TABLE meal_templates DROP CONSTRAINT IF EXISTS meal_templates_meal_type_check;
ALTER TABLE meal_templates ADD CONSTRAINT meal_templates_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'snack'));

UPDATE meals SET meal_type = 'mittagessen' WHERE meal_type = 'hauptmahlzeit';

ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_meal_type_check;
ALTER TABLE meals ADD CONSTRAINT meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'mittagessen', 'abendessen', 'snack'));

ALTER TABLE meal_template_items DROP CONSTRAINT IF EXISTS meal_template_items_unit_check;
ALTER TABLE meal_template_items ADD CONSTRAINT meal_template_items_unit_check
  CHECK (unit IN ('g', 'ml', 'dl', 'l', 'stk'));

ALTER TABLE meal_items DROP CONSTRAINT IF EXISTS meal_items_unit_check;
ALTER TABLE meal_items ADD CONSTRAINT meal_items_unit_check
  CHECK (unit IN ('g', 'ml', 'dl', 'l', 'stk'));

-- ============================================================
-- 4. Unique-Constraint für foods.name (Import-Upsert)
-- ============================================================

-- Doppelte Namen bereinigen (behält jeweils den ältesten)
DELETE FROM foods f1
USING foods f2
WHERE f1.name = f2.name
  AND f1.created_at > f2.created_at;

ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_name_unique;
ALTER TABLE foods ADD CONSTRAINT foods_name_unique UNIQUE (name);

-- ============================================================
-- 5. Default-Einstellungen
-- ============================================================

INSERT INTO settings (key, value) VALUES ('kcal_ziel',    '2000') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('protein_ziel', '150')  ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('kosten_ziel',  '20')   ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 6. Daten-Migration: hauptmahlzeit
-- ============================================================

UPDATE meal_templates SET meal_type = 'hauptmahlzeit'
WHERE meal_type IN ('mittagessen', 'abendessen');

-- ============================================================
-- 7. RLS aktivieren + Policies
-- ============================================================

ALTER TABLE foods                ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_template_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list        ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_markers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_template_days   ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_template_meals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_template_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_meal_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_items           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON foods;
DROP POLICY IF EXISTS "allow_all" ON food_categories;
DROP POLICY IF EXISTS "allow_all" ON meal_templates;
DROP POLICY IF EXISTS "allow_all" ON meal_template_items;
DROP POLICY IF EXISTS "allow_all" ON meal_plans;
DROP POLICY IF EXISTS "allow_all" ON meals;
DROP POLICY IF EXISTS "allow_all" ON meal_items;
DROP POLICY IF EXISTS "allow_all" ON shopping_list;
DROP POLICY IF EXISTS "allow_all" ON settings;
DROP POLICY IF EXISTS "allow_all" ON day_markers;
DROP POLICY IF EXISTS "allow_all" ON plan_templates;
DROP POLICY IF EXISTS "allow_all" ON plan_template_days;
DROP POLICY IF EXISTS "allow_all" ON plan_template_meals;
DROP POLICY IF EXISTS "allow_all" ON plan_template_items;
DROP POLICY IF EXISTS "allow_all" ON event_meal_rules;
DROP POLICY IF EXISTS "allow_all" ON notes;
DROP POLICY IF EXISTS "allow_all" ON note_items;

CREATE POLICY "allow_all" ON foods               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON food_categories      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meal_templates       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meal_template_items  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meal_plans           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meals                FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meal_items           FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON shopping_list        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON settings             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON day_markers          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON plan_templates       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON plan_template_days   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON plan_template_meals  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON plan_template_items  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON event_meal_rules     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON notes                FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON note_items           FOR ALL TO anon USING (true) WITH CHECK (true);
