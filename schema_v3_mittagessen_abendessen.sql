-- ============================================================
-- Schema v3: Tagesplan mit Mittagessen/Abendessen,
--            Vorlagen bleiben fruehstueck/hauptmahlzeit/snack
--            + template_categories Tabelle
-- In Supabase SQL-Editor ausführen
-- ============================================================

-- 1. meals: Constraint auf 5 Typen erweitern (hauptmahlzeit bleibt für Bestandsdaten)
ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_meal_type_check;
ALTER TABLE meals ADD CONSTRAINT meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

-- 2. meal_templates: Constraint auf 3 Typen festhalten + Kategorie-Spalte
ALTER TABLE meal_templates DROP CONSTRAINT IF EXISTS meal_templates_meal_type_check;
ALTER TABLE meal_templates ADD CONSTRAINT meal_templates_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'snack'));

-- Bestehende mittagessen/abendessen Vorlagen → hauptmahlzeit
UPDATE meal_templates SET meal_type = 'hauptmahlzeit' WHERE meal_type IN ('mittagessen', 'abendessen');

ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS category TEXT;

-- 3. plan_template_meals: Constraint auf 5 Typen
ALTER TABLE plan_template_meals DROP CONSTRAINT IF EXISTS plan_template_meals_meal_type_check;
ALTER TABLE plan_template_meals ADD CONSTRAINT plan_template_meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

-- 4. event_meal_rules: Constraint auf 5 Typen
ALTER TABLE event_meal_rules DROP CONSTRAINT IF EXISTS event_meal_rules_meal_type_check;
ALTER TABLE event_meal_rules ADD CONSTRAINT event_meal_rules_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

-- 5. notes: Constraint auf 5 Typen
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_meal_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

-- 6. foods: stk-Unit erlauben
ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_unit_check;
ALTER TABLE foods ADD CONSTRAINT foods_unit_check
  CHECK (unit IN ('g', 'ml', 'stk'));

-- 7. Vorlagenkategorien-Tabelle
CREATE TABLE IF NOT EXISTS template_categories (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE template_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON template_categories;
CREATE POLICY "allow_all" ON template_categories FOR ALL TO anon USING (true) WITH CHECK (true);
