-- ============================================================================
-- 0009_fix_planned_batch_recalc.sql
--
-- Korrigiert recalc_planned_batches_for_recipe() aus 0007.
--
-- FEHLER: die Funktion baute
--
--   UPDATE prep_batches pb SET ... FROM prep_cycles c, LATERAL (
--     SELECT ... WHERE ri.recipe_id = pb.recipe_id
--   ) s
--
-- Ein LATERAL-Element in der FROM-Liste eines UPDATE darf die Zieltabelle
-- nicht referenzieren. Postgres bricht ab mit:
--
--   ERROR 42P10: invalid reference to FROM-clause entry for table "pb"
--
-- Ausgeloest wurde das durch den Trigger recipe_items_batches, also bei
-- JEDEM Anlegen oder Aendern einer Zutat.
--
-- KORREKTUR: die Werte pro Portion einmal ausrechnen und dann setzen. Alle
-- Toepfe desselben Rezepts teilen sie ohnehin -- der LATERAL-Join pro Zeile
-- war von vornherein unnoetig.
--
-- Zusaetzlich wird jetzt wie im Frontend gerundet: calcNutrition() rundet
-- jede Position auf eine Nachkommastelle, Kosten auf drei. Ohne das
-- Zwischenrunden koennen Batch-Werte um Zehntel von dem abweichen, was die
-- Oberflaeche beim Anlegen des Zyklus angezeigt hat.
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION recalc_planned_batches_for_recipe(p_recipe_id UUID) RETURNS VOID AS $$
DECLARE
  v_kcal    NUMERIC;
  v_protein NUMERIC;
  v_carbs   NUMERIC;
  v_fat     NUMERIC;
  v_cost    NUMERIC;
BEGIN
  SELECT
    COALESCE(ROUND(SUM(ROUND(f.calories_per_100 * portion_factor(ri.amount_per_portion, ri.unit), 1)), 1), 0),
    COALESCE(ROUND(SUM(ROUND(f.protein_per_100  * portion_factor(ri.amount_per_portion, ri.unit), 1)), 1), 0),
    COALESCE(ROUND(SUM(ROUND(f.carbs_per_100    * portion_factor(ri.amount_per_portion, ri.unit), 1)), 1), 0),
    COALESCE(ROUND(SUM(ROUND(f.fat_per_100      * portion_factor(ri.amount_per_portion, ri.unit), 1)), 1), 0),
    COALESCE(ROUND(SUM(ROUND(f.cost_per_100     * portion_factor(ri.amount_per_portion, ri.unit), 3)), 3), 0)
  INTO v_kcal, v_protein, v_carbs, v_fat, v_cost
  FROM recipe_items ri
  JOIN foods f ON f.id = ri.food_id
  WHERE ri.recipe_id = p_recipe_id;

  UPDATE prep_batches pb SET
    kcal_per_portion    = v_kcal,
    protein_per_portion = v_protein,
    carbs_per_portion   = v_carbs,
    fat_per_portion     = v_fat,
    cost_per_portion    = v_cost
  FROM prep_cycles c
  WHERE pb.recipe_id = p_recipe_id
    AND c.id = pb.cycle_id
    AND c.status = 'geplant';
END;
$$ LANGUAGE plpgsql;

-- Verifikation --------------------------------------------------------------
--
-- Die Funktion muss ohne Fehler durchlaufen, auch fuer ein Rezept, das in
-- keinem Zyklus steckt:
--
--   SELECT recalc_planned_batches_for_recipe(id) FROM recipes LIMIT 5;
--
-- Erwartet: fuenf Zeilen, keine Fehlermeldung.
--
-- Danach greift auch der Trigger recipe_items_batches wieder. Gegenprobe:
--
--   BEGIN;
--     INSERT INTO recipes (name, meal_type) VALUES ('ZZ_PROBE', 'mittagessen');
--     INSERT INTO recipe_items (recipe_id, food_id, food_name, amount_per_portion, unit)
--     SELECT r.id, f.id, f.name, 100, 'g'
--     FROM recipes r, foods f
--     WHERE r.name = 'ZZ_PROBE' ORDER BY f.name LIMIT 1;
--   ROLLBACK;
--
-- Erwartet: laeuft durch. Vor dieser Migration schlug schon das INSERT fehl.
