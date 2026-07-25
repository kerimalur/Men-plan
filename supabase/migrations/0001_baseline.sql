-- ============================================================================
-- 0001_baseline.sql
--
-- Bildet den TATSAECHLICHEN Stand der Menueplan-Tabellen ab, wie er am
-- 2026-07-25 in Supabase-Projekt kvpexrorkqmxnzqvexga vorgefunden wurde --
-- nicht den Stand der alten schema*.sql-Dateien (jetzt unter supabase/legacy/).
--
-- Bewusst NICHT uebernommen: das rueckwaerts migrierende
--   UPDATE meal_templates SET meal_type = 'hauptmahlzeit'
--       WHERE meal_type IN ('mittagessen','abendessen')
-- aus schema.sql Abschnitt 6. Es hat den Legacy-Wert bei jedem erneuten
-- Ausfuehren wiederhergestellt. 0002 raeumt ihn endgueltig ab.
--
-- ACHTUNG: Diese Datenbank wird mit dem Gym-Tracker und dem Trading-Journal
-- geteilt. Migrationen duerfen ausschliesslich die hier gelisteten Tabellen
-- anfassen.
--
-- Idempotent und vorwaertsgerichtet: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Kategorien
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS food_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Lebensmittel
--
-- calories_per_100g / protein_per_100g sind Altlasten aus schema.sql
-- Abschnitt 2. Sie werden nirgends gelesen und in 0003 entfernt.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS foods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  calories_per_100 DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_per_100  DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost_per_100     DECIMAL(8,4) NOT NULL DEFAULT 0,
  unit             TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g','ml','stk')),
  category_id      UUID REFERENCES food_categories(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE foods ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES food_categories(id) ON DELETE SET NULL;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS calories_per_100g DECIMAL(8,2);
ALTER TABLE foods ADD COLUMN IF NOT EXISTS protein_per_100g  DECIMAL(8,2);

-- ---------------------------------------------------------------------------
-- 3. Tagesplaene
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS meal_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date          DATE NOT NULL UNIQUE,
  kcal_total    DECIMAL(8,2) DEFAULT 0,
  protein_total DECIMAL(8,2) DEFAULT 0,
  cost_total    DECIMAL(8,4) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID REFERENCES meal_plans(id) ON DELETE CASCADE,
  meal_type     TEXT NOT NULL,
  name          TEXT NOT NULL,
  kcal_total    DECIMAL(8,2) DEFAULT 0,
  protein_total DECIMAL(8,2) DEFAULT 0,
  cost_total    DECIMAL(8,4) DEFAULT 0,
  eaten         BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE meals ADD COLUMN IF NOT EXISTS eaten BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS meal_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id    UUID REFERENCES meals(id) ON DELETE CASCADE,
  food_id    UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name  TEXT NOT NULL,
  amount     DECIMAL(8,2) NOT NULL,
  unit       TEXT NOT NULL,
  kcal       DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein    DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost       DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. Mahlzeit-Vorlagen (werden in 0005/0006 nach recipes ueberfuehrt)
--
-- meal_template_items hat KEIN food_name -- nur food_id. Die Migration nach
-- recipe_items muss deshalb auf foods joinen.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS meal_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  meal_type  TEXT NOT NULL,
  category   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS category TEXT;

CREATE TABLE IF NOT EXISTS meal_template_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES meal_templates(id) ON DELETE CASCADE,
  food_id     UUID REFERENCES foods(id) ON DELETE CASCADE,
  amount      DECIMAL(8,2) NOT NULL,
  unit        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. Tages- und Wochenvorlagen (werden in Phase 2 durch Prep-Zyklen abgeloest)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plan_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_template_days (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES plan_templates(id) ON DELETE CASCADE,
  day_offset  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_template_meals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_day_id UUID REFERENCES plan_template_days(id) ON DELETE CASCADE,
  meal_type       TEXT NOT NULL,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_template_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_meal_id UUID REFERENCES plan_template_meals(id) ON DELETE CASCADE,
  food_id          UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name        TEXT NOT NULL,
  amount           DECIMAL(8,2) NOT NULL,
  unit             TEXT NOT NULL,
  kcal             DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein          DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost             DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6. Notizen / Rezeptideen (werden in 0006 nach recipes ueberfuehrt)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL DEFAULT '',
  freetext   TEXT DEFAULT '',
  meal_type  TEXT,
  status     TEXT DEFAULT 'idee' CHECK (status IN ('idee','zutaten_erfasst','bereit')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS note_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     UUID REFERENCES notes(id) ON DELETE CASCADE,
  food_id     UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name   TEXT NOT NULL,
  amount      DECIMAL(8,2),
  unit        TEXT DEFAULT 'g',
  is_resolved BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. Grosse Menues (frueher Meal-Prep-Versuch, Mengen = TOTAL fuer alle Tage;
--    wird in 0006 nach recipes ueberfuehrt, Mengen dabei durch num_days geteilt)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS grosse_menus (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  num_days   INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grosse_menu_meals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id    UUID REFERENCES grosse_menus(id) ON DELETE CASCADE,
  meal_type  TEXT NOT NULL DEFAULT 'mittagessen',
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grosse_menu_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_meal_id UUID REFERENCES grosse_menu_meals(id) ON DELETE CASCADE,
  food_id      UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name    TEXT NOT NULL,
  amount       DECIMAL(8,2) NOT NULL,
  unit         TEXT NOT NULL,
  kcal         DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein      DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost         DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_distribution_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id    UUID NOT NULL REFERENCES grosse_menus(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_dist_log_menu ON menu_distribution_log(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_dist_log_date ON menu_distribution_log(date);

-- ---------------------------------------------------------------------------
-- 8. Einkaufsliste, Einstellungen, Tagesmarker, Event-Regeln
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS shopping_list (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item       TEXT NOT NULL,
  quantity   TEXT,
  checked    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS day_markers (
  date       DATE PRIMARY KEY,
  training   BOOLEAN DEFAULT FALSE,
  eingeladen BOOLEAN DEFAULT FALSE,
  notiz      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_meal_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL CHECK (event_type IN ('training','eingeladen')),
  meal_type   TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9. Row Level Security
--
-- SICHERHEITSHINWEIS: allow_all fuer die Rolle anon bedeutet, dass jeder mit
-- der Projekt-URL und dem oeffentlichen anon-Key alle Daten lesen und
-- schreiben kann. Das ist der bewusst beibehaltene Ist-Zustand; siehe
-- README.md, Abschnitt "Sicherheit".
-- ---------------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'foods','food_categories','template_categories',
    'meal_plans','meals','meal_items',
    'meal_templates','meal_template_items',
    'plan_templates','plan_template_days','plan_template_meals','plan_template_items',
    'notes','note_items',
    'grosse_menus','grosse_menu_meals','grosse_menu_items','menu_distribution_log',
    'shopping_list','settings','day_markers','event_meal_rules'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', t);
    EXECUTE format('CREATE POLICY allow_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
