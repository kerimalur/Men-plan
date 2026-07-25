-- ============================================================================
-- 0003_macros.sql
--
-- Kohlenhydrate und Fett auf foods und allen abgeleiteten Item-Tabellen,
-- dazu carbs_total/fat_total auf meals und meal_plans.
--
-- Bestandsdaten behalten 0 -- die Werte werden nach und nach nachgepflegt.
-- In der UI werden Carbs und Fett nur angezeigt, wenn > 0, damit
-- unvollstaendige Datensaetze nicht wie Fehler aussehen.
--
-- ----------------------------------------------------------------------------
-- ABWEICHUNG VOM UMBAU-AUFTRAG, bewusst:
--
-- Der Auftrag vermutet, foods.calories_per_100g / foods.protein_per_100g seien
-- ungenutzte Altlasten, und verlangt "pruefen, ob sie irgendwo gelesen werden,
-- und falls nicht, per Migration entfernen".
--
-- Die Pruefung faellt negativ aus: die Spalten WERDEN gelesen und tragen ein
-- echtes Feature. Bei Lebensmitteln mit unit='stk' halten sie die Per-100g-
-- Werte, damit dasselbe Lebensmittel wahlweise in Stueck oder in Gramm erfasst
-- werden kann. Lesende Stellen:
--   components/MealModal.tsx    effectiveFood(), Einheiten-Auswahl
--   components/FoodSearch.tsx   Food-Interface, Trefferliste
--   app/datenbank/page.tsx      Formularfelder, Speichern, Liste
--
-- Die Spalten bleiben deshalb erhalten. Aktuell ist genau 1 von 109
-- foods-Zeilen befuellt.
-- ----------------------------------------------------------------------------
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

-- 1. Lebensmittel ----------------------------------------------------------

ALTER TABLE foods ADD COLUMN IF NOT EXISTS carbs_per_100 DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS fat_per_100   DECIMAL(8,2) NOT NULL DEFAULT 0;

-- 2. Item-Tabellen ---------------------------------------------------------

ALTER TABLE meal_items          ADD COLUMN IF NOT EXISTS carbs DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE meal_items          ADD COLUMN IF NOT EXISTS fat   DECIMAL(8,2) NOT NULL DEFAULT 0;

ALTER TABLE plan_template_items ADD COLUMN IF NOT EXISTS carbs DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE plan_template_items ADD COLUMN IF NOT EXISTS fat   DECIMAL(8,2) NOT NULL DEFAULT 0;

ALTER TABLE grosse_menu_items   ADD COLUMN IF NOT EXISTS carbs DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE grosse_menu_items   ADD COLUMN IF NOT EXISTS fat   DECIMAL(8,2) NOT NULL DEFAULT 0;

-- 3. Summenspalten ---------------------------------------------------------

ALTER TABLE meals      ADD COLUMN IF NOT EXISTS carbs_total DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE meals      ADD COLUMN IF NOT EXISTS fat_total   DECIMAL(8,2) NOT NULL DEFAULT 0;

ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS carbs_total DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS fat_total   DECIMAL(8,2) NOT NULL DEFAULT 0;

-- 4. Verifikation ----------------------------------------------------------
--
--   SELECT table_name, column_name FROM information_schema.columns
--   WHERE table_schema='public' AND column_name IN
--     ('carbs_per_100','fat_per_100','carbs','fat','carbs_total','fat_total')
--   ORDER BY 1,2;
--
-- Erwartet: 14 Zeilen ueber foods, meal_items, plan_template_items,
-- grosse_menu_items, meals, meal_plans.
--
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='foods'
--     AND column_name IN ('calories_per_100g','protein_per_100g');
--
-- Erwartet: 2 -- die Spalten bleiben absichtlich bestehen (siehe oben).
