-- ============================================================
-- Menüplan – Supabase SQL Schema
-- Dieses Schema in den Supabase SQL-Editor einfügen und ausführen
-- ============================================================

-- Lebensmittel-Datenbank
CREATE TABLE foods (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  calories_per_100 DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_per_100  DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost_per_100     DECIMAL(8,4) NOT NULL DEFAULT 0,  -- CHF pro 100g oder 100ml
  unit             TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'ml')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Mahlzeit-Vorlagen
CREATE TABLE meal_templates (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  meal_type  TEXT NOT NULL CHECK (meal_type IN ('fruehstueck', 'mittagessen', 'abendessen', 'snack')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Zutaten einer Vorlage
CREATE TABLE meal_template_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES meal_templates(id) ON DELETE CASCADE,
  food_id     UUID REFERENCES foods(id) ON DELETE CASCADE,
  amount      DECIMAL(8,2) NOT NULL,
  unit        TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'dl', 'l')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tagesplan (ein Eintrag pro Tag)
CREATE TABLE meal_plans (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date           DATE NOT NULL UNIQUE,
  kcal_total     DECIMAL(8,2) DEFAULT 0,
  protein_total  DECIMAL(8,2) DEFAULT 0,
  cost_total     DECIMAL(8,4) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Mahlzeiten eines Tages
CREATE TABLE meals (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id        UUID REFERENCES meal_plans(id) ON DELETE CASCADE,
  meal_type      TEXT NOT NULL CHECK (meal_type IN ('fruehstueck', 'mittagessen', 'abendessen', 'snack')),
  name           TEXT NOT NULL,
  kcal_total     DECIMAL(8,2) DEFAULT 0,
  protein_total  DECIMAL(8,2) DEFAULT 0,
  cost_total     DECIMAL(8,4) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Zutaten einer Mahlzeit (gespeicherte Nährwerte zum Zeitpunkt der Eingabe)
CREATE TABLE meal_items (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meal_id   UUID REFERENCES meals(id) ON DELETE CASCADE,
  food_id   UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name TEXT NOT NULL,         -- Snapshot des Namens
  amount    DECIMAL(8,2) NOT NULL,
  unit      TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'dl', 'l')),
  kcal      DECIMAL(8,2) NOT NULL DEFAULT 0,    -- gespeichert
  protein   DECIMAL(8,2) NOT NULL DEFAULT 0,    -- gespeichert
  cost      DECIMAL(8,4) NOT NULL DEFAULT 0,    -- gespeichert
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Einkaufsliste (Struktur, Logik folgt)
CREATE TABLE shopping_list (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item       TEXT NOT NULL,
  quantity   TEXT,
  checked    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS Policies (persönliche App – alle Operationen erlaubt)
-- ============================================================
ALTER TABLE foods                ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_template_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON foods               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meal_templates      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meal_template_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meal_plans          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meals               FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON meal_items          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON shopping_list       FOR ALL TO anon USING (true) WITH CHECK (true);
