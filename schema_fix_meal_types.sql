-- ============================================================
-- Fix: Alle meal_type Constraints auf 3 Typen vereinheitlichen
-- (fruehstueck, hauptmahlzeit, snack)
-- In Supabase SQL-Editor ausführen
-- ============================================================

-- 1. plan_template_meals: Bestehende Daten migrieren, dann Constraint
ALTER TABLE plan_template_meals DROP CONSTRAINT IF EXISTS plan_template_meals_meal_type_check;
UPDATE plan_template_meals SET meal_type = 'hauptmahlzeit' WHERE meal_type IN ('mittagessen', 'abendessen');
ALTER TABLE plan_template_meals ADD CONSTRAINT plan_template_meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'snack'));

-- 2. event_meal_rules: Bestehende Daten migrieren, dann Constraint
ALTER TABLE event_meal_rules DROP CONSTRAINT IF EXISTS event_meal_rules_meal_type_check;
UPDATE event_meal_rules SET meal_type = 'hauptmahlzeit' WHERE meal_type IN ('mittagessen', 'abendessen');
ALTER TABLE event_meal_rules ADD CONSTRAINT event_meal_rules_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'snack'));

-- 3. notes.meal_type: Bestehende Daten migrieren, dann Constraint
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_meal_type_check;
UPDATE notes SET meal_type = 'hauptmahlzeit' WHERE meal_type IN ('mittagessen', 'abendessen');
ALTER TABLE notes ADD CONSTRAINT notes_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'snack'));

-- 4. meals.meal_type: Constraint entfernen, Daten migrieren, neuen Constraint setzen
ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_meal_type_check;
UPDATE meals SET meal_type = 'hauptmahlzeit' WHERE meal_type IN ('mittagessen', 'abendessen');
ALTER TABLE meals ADD CONSTRAINT meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck', 'hauptmahlzeit', 'snack'));
