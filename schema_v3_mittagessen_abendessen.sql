-- ============================================================
-- Schema v3: Mittagessen/Abendessen wieder trennen + Kategorien
-- In Supabase SQL-Editor ausführen
-- ============================================================

-- 1. meals: Constraint auf 5 Typen erweitern (hauptmahlzeit bleibt für Bestandsdaten)
ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_meal_type_check;
ALTER TABLE meals ADD CONSTRAINT meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

-- 2. meal_templates: Constraint erweitern + Kategorie-Spalte hinzufügen
ALTER TABLE meal_templates DROP CONSTRAINT IF EXISTS meal_templates_meal_type_check;
ALTER TABLE meal_templates ADD CONSTRAINT meal_templates_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS category TEXT;

-- 3. plan_template_meals: Constraint erweitern
ALTER TABLE plan_template_meals DROP CONSTRAINT IF EXISTS plan_template_meals_meal_type_check;
ALTER TABLE plan_template_meals ADD CONSTRAINT plan_template_meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

-- 4. event_meal_rules: Constraint erweitern (falls Tabelle vorhanden)
ALTER TABLE event_meal_rules DROP CONSTRAINT IF EXISTS event_meal_rules_meal_type_check;
ALTER TABLE event_meal_rules ADD CONSTRAINT event_meal_rules_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

-- 5. notes: Constraint erweitern (falls Tabelle vorhanden)
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_meal_type_check;
ALTER TABLE notes ADD CONSTRAINT notes_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'mittagessen', 'abendessen', 'snack'));

-- 6. foods: stk-Unit erlauben (falls noch nicht vorhanden)
ALTER TABLE foods DROP CONSTRAINT IF EXISTS foods_unit_check;
ALTER TABLE foods ADD CONSTRAINT foods_unit_check
  CHECK (unit IN ('g', 'ml', 'stk'));
