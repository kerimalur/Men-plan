-- ============================================================================
-- 0004_totals_triggers.sql
--
-- Summen wandern aus dem Frontend in die Datenbank.
--
-- Bisher rechneten handleSave, deleteItem, updateItemAmount, deleteMeal und
-- duplicateMeal in app/tag/[datum]/page.tsx die Summen jeweils von Hand neu
-- und riefen danach zusaetzlich loadData() -- fuenf fast identische Codepfade,
-- die auseinanderlaufen konnten.
--
-- Ab hier gilt: wer meal_items aendert, aendert damit automatisch die Summen
-- in meals, und wer meals aendert, aendert die Summen in meal_plans.
--
-- Kaskade:
--   meal_items  --trigger-->  meals.kcal_total ...
--   meals       --trigger-->  meal_plans.kcal_total ...
--
-- Die zweite Stufe wird durch das UPDATE der ersten ausgeloest. Keine Rekursion:
-- meal_plans hat keinen Trigger zurueck auf meals.
--
-- Phase 2 ersetzt recalc_plan_totals durch eine Variante, die zusaetzlich
-- batch_portions beruecksichtigt (Migration 0007).
--
-- Idempotent: Funktionen per CREATE OR REPLACE, Trigger per DROP + CREATE.
-- ============================================================================

-- 1. Summen einer Mahlzeit aus ihren Positionen ----------------------------

CREATE OR REPLACE FUNCTION recalc_meal_totals(p_meal_id UUID) RETURNS VOID AS $$
BEGIN
  IF p_meal_id IS NULL THEN RETURN; END IF;

  UPDATE meals m SET
    kcal_total    = COALESCE(s.kcal, 0),
    protein_total = COALESCE(s.protein, 0),
    carbs_total   = COALESCE(s.carbs, 0),
    fat_total     = COALESCE(s.fat, 0),
    cost_total    = COALESCE(s.cost, 0)
  FROM (
    SELECT SUM(kcal) AS kcal, SUM(protein) AS protein, SUM(carbs) AS carbs,
           SUM(fat) AS fat, SUM(cost) AS cost
    FROM meal_items WHERE meal_id = p_meal_id
  ) s
  WHERE m.id = p_meal_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Summen eines Tages aus seinen Mahlzeiten ------------------------------

CREATE OR REPLACE FUNCTION recalc_plan_totals(p_plan_id UUID) RETURNS VOID AS $$
BEGIN
  IF p_plan_id IS NULL THEN RETURN; END IF;

  UPDATE meal_plans p SET
    kcal_total    = COALESCE(s.kcal, 0),
    protein_total = COALESCE(s.protein, 0),
    carbs_total   = COALESCE(s.carbs, 0),
    fat_total     = COALESCE(s.fat, 0),
    cost_total    = COALESCE(s.cost, 0)
  FROM (
    SELECT SUM(kcal_total) AS kcal, SUM(protein_total) AS protein,
           SUM(carbs_total) AS carbs, SUM(fat_total) AS fat,
           SUM(cost_total) AS cost
    FROM meals WHERE plan_id = p_plan_id
  ) s
  WHERE p.id = p_plan_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger auf meal_items ------------------------------------------------

CREATE OR REPLACE FUNCTION trg_meal_items_totals() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_meal_totals(OLD.meal_id);
    RETURN OLD;
  END IF;

  PERFORM recalc_meal_totals(NEW.meal_id);

  -- Position in eine andere Mahlzeit verschoben: beide neu rechnen.
  IF TG_OP = 'UPDATE' AND OLD.meal_id IS DISTINCT FROM NEW.meal_id THEN
    PERFORM recalc_meal_totals(OLD.meal_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meal_items_totals ON meal_items;
CREATE TRIGGER meal_items_totals
  AFTER INSERT OR UPDATE OR DELETE ON meal_items
  FOR EACH ROW EXECUTE FUNCTION trg_meal_items_totals();

-- 4. Trigger auf meals -----------------------------------------------------

CREATE OR REPLACE FUNCTION trg_meals_totals() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_plan_totals(OLD.plan_id);
    RETURN OLD;
  END IF;

  PERFORM recalc_plan_totals(NEW.plan_id);

  -- Mahlzeit auf einen anderen Tag verschoben: beide Tage neu rechnen.
  IF TG_OP = 'UPDATE' AND OLD.plan_id IS DISTINCT FROM NEW.plan_id THEN
    PERFORM recalc_plan_totals(OLD.plan_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meals_totals ON meals;
CREATE TRIGGER meals_totals
  AFTER INSERT OR UPDATE OR DELETE ON meals
  FOR EACH ROW EXECUTE FUNCTION trg_meals_totals();

-- 5. Bestandsdaten einmalig nachrechnen ------------------------------------
--
-- Direkt als Mengen-UPDATE statt ueber die Funktionen -- schneller und
-- unabhaengig davon, ob die Trigger schon greifen.

UPDATE meals m SET
  kcal_total    = COALESCE(s.kcal, 0),
  protein_total = COALESCE(s.protein, 0),
  carbs_total   = COALESCE(s.carbs, 0),
  fat_total     = COALESCE(s.fat, 0),
  cost_total    = COALESCE(s.cost, 0)
FROM (
  SELECT meal_id,
         SUM(kcal) AS kcal, SUM(protein) AS protein, SUM(carbs) AS carbs,
         SUM(fat) AS fat, SUM(cost) AS cost
  FROM meal_items GROUP BY meal_id
) s
WHERE m.id = s.meal_id;

-- Mahlzeiten ganz ohne Positionen auf 0 setzen.
UPDATE meals SET kcal_total = 0, protein_total = 0, carbs_total = 0,
                 fat_total = 0, cost_total = 0
WHERE NOT EXISTS (SELECT 1 FROM meal_items mi WHERE mi.meal_id = meals.id);

UPDATE meal_plans p SET
  kcal_total    = COALESCE(s.kcal, 0),
  protein_total = COALESCE(s.protein, 0),
  carbs_total   = COALESCE(s.carbs, 0),
  fat_total     = COALESCE(s.fat, 0),
  cost_total    = COALESCE(s.cost, 0)
FROM (
  SELECT plan_id,
         SUM(kcal_total) AS kcal, SUM(protein_total) AS protein,
         SUM(carbs_total) AS carbs, SUM(fat_total) AS fat,
         SUM(cost_total) AS cost
  FROM meals GROUP BY plan_id
) s
WHERE p.id = s.plan_id;

UPDATE meal_plans SET kcal_total = 0, protein_total = 0, carbs_total = 0,
                      fat_total = 0, cost_total = 0
WHERE NOT EXISTS (SELECT 1 FROM meals m WHERE m.plan_id = meal_plans.id);

-- 6. Verifikation: Akzeptanzkriterium 11 -----------------------------------
--
-- Historische Tagesplaene duerfen sich in ihren Naehrwerten nicht veraendern.
-- Diese Abfrage muss 0 Zeilen liefern:
--
--   SELECT s.date,
--          s.kcal_total    AS alt_kcal,   p.kcal_total    AS neu_kcal,
--          s.protein_total AS alt_prot,   p.protein_total AS neu_prot,
--          s.cost_total    AS alt_kosten, p.cost_total    AS neu_kosten
--   FROM meal_plans_snapshot_20260725 s
--   JOIN meal_plans p ON p.id = s.id
--   WHERE round(s.kcal_total, 1)    IS DISTINCT FROM round(p.kcal_total, 1)
--      OR round(s.protein_total, 1) IS DISTINCT FROM round(p.protein_total, 1)
--      OR round(s.cost_total, 3)    IS DISTINCT FROM round(p.cost_total, 3);
--
-- Und die Gesamtsummen muessen exakt die Ausgangswerte treffen:
--
--   SELECT count(*)                    AS plaene,        -- 68
--          round(sum(kcal_total), 2)   AS kcal,          -- 119694.90
--          round(sum(protein_total), 2) AS protein,      -- 13277.50
--          round(sum(cost_total), 3)   AS kosten         -- 1060.483
--   FROM meal_plans;
--
-- Weicht etwas ab, waren die vom Frontend geschriebenen Summen falsch.
-- Dann ZUERST die Abweichung dokumentieren, bevor irgendetwas anderes passiert.
