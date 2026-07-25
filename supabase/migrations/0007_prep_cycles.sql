-- ============================================================================
-- 0007_prep_cycles.sql
--
-- Das Herzstueck: Kochzyklus -> Topf -> Box.
--
--   prep_cycles     ein Kochtag, der 2 oder 3 Tage abdeckt
--   prep_batches    ein Topf: Rezept x Portionen
--   batch_portions  eine Box, einem Tag und Slot zugeordnet
--
-- Rechenweg, am Beispiel aus dem Umbau-Auftrag:
--   Rezept A (Mittag) 300 g Kartoffeln pro Portion, 3 Portionen -> Topf A 900 g
--   Rezept B (Abend)  200 g Kartoffeln pro Portion, 3 Portionen -> Topf B 600 g
--   Einkaufsliste: eine Position Kartoffeln, 1500 g
--   Box-Aufteilung: 3 Boxen a 300 g, 3 Boxen a 200 g
--
-- meals und meal_items bleiben erhalten, dienen aber nur noch Einzelmahlzeiten
-- an freien Tagen und Ad-hoc-Eintraegen. Die Tagessummen muessen ab hier BEIDE
-- Quellen beruecksichtigen -- dafuer wird recalc_plan_totals aus 0004 ersetzt.
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

-- 1. Tabellen --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS prep_cycles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL DEFAULT '',
  cook_date  DATE NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'geplant'
             CHECK (status IN ('geplant','eingekauft','gekocht','erledigt')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT prep_cycles_range_check CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS prep_batches (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id  UUID NOT NULL REFERENCES prep_cycles(id) ON DELETE CASCADE,
  -- RESTRICT: ein Rezept, das in einem gekochten Zyklus steckt, darf nicht
  -- einfach verschwinden.
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack')),
  portions  INT NOT NULL CHECK (portions BETWEEN 1 AND 14),
  -- Eingefrorene Werte pro Portion zum Zeitpunkt des Anlegens, damit spaetere
  -- Rezeptaenderungen bereits gekochte Zyklen nicht rueckwirkend verschieben.
  kcal_per_portion    DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_per_portion DECIMAL(8,2) NOT NULL DEFAULT 0,
  carbs_per_portion   DECIMAL(8,2) NOT NULL DEFAULT 0,
  fat_per_portion     DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost_per_portion    DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_portions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id  UUID NOT NULL REFERENCES prep_batches(id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack')),
  consumed  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (batch_id, date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_prep_batches_cycle   ON prep_batches(cycle_id);
CREATE INDEX IF NOT EXISTS idx_batch_portions_batch ON batch_portions(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_portions_date  ON batch_portions(date);
CREATE INDEX IF NOT EXISTS idx_prep_cycles_dates    ON prep_cycles(start_date, end_date);

-- 2. Tagessummen aus BEIDEN Quellen ----------------------------------------
--
-- Ersetzt recalc_plan_totals aus 0004. Ab hier zaehlen freie Mahlzeiten aus
-- meals UND Boxen aus batch_portions in dieselbe Tagessumme.

CREATE OR REPLACE FUNCTION recalc_plan_totals_for_date(p_date DATE) RETURNS VOID AS $$
DECLARE
  v_plan UUID;
BEGIN
  SELECT id INTO v_plan FROM meal_plans WHERE date = p_date;
  IF v_plan IS NULL THEN RETURN; END IF;

  UPDATE meal_plans p SET
    kcal_total    = COALESCE(m.kcal, 0)    + COALESCE(b.kcal, 0),
    protein_total = COALESCE(m.protein, 0) + COALESCE(b.protein, 0),
    carbs_total   = COALESCE(m.carbs, 0)   + COALESCE(b.carbs, 0),
    fat_total     = COALESCE(m.fat, 0)     + COALESCE(b.fat, 0),
    cost_total    = COALESCE(m.cost, 0)    + COALESCE(b.cost, 0)
  FROM
    (SELECT SUM(kcal_total) AS kcal, SUM(protein_total) AS protein,
            SUM(carbs_total) AS carbs, SUM(fat_total) AS fat,
            SUM(cost_total) AS cost
     FROM meals WHERE plan_id = v_plan) m,
    (SELECT SUM(pb.kcal_per_portion)    AS kcal,
            SUM(pb.protein_per_portion) AS protein,
            SUM(pb.carbs_per_portion)   AS carbs,
            SUM(pb.fat_per_portion)     AS fat,
            SUM(pb.cost_per_portion)    AS cost
     FROM batch_portions bp
     JOIN prep_batches pb ON pb.id = bp.batch_id
     WHERE bp.date = p_date) b
  WHERE p.id = v_plan;
END;
$$ LANGUAGE plpgsql;

-- Duenner Wrapper, damit die Trigger aus 0004 unveraendert weiterlaufen.
CREATE OR REPLACE FUNCTION recalc_plan_totals(p_plan_id UUID) RETURNS VOID AS $$
DECLARE
  v_date DATE;
BEGIN
  IF p_plan_id IS NULL THEN RETURN; END IF;
  SELECT date INTO v_date FROM meal_plans WHERE id = p_plan_id;
  IF v_date IS NULL THEN RETURN; END IF;
  PERFORM recalc_plan_totals_for_date(v_date);
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger auf batch_portions --------------------------------------------

CREATE OR REPLACE FUNCTION trg_batch_portions_totals() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_plan_totals_for_date(OLD.date);
    RETURN OLD;
  END IF;

  PERFORM recalc_plan_totals_for_date(NEW.date);

  -- Box auf einen anderen Tag verschoben: beide Tage neu rechnen.
  IF TG_OP = 'UPDATE' AND OLD.date IS DISTINCT FROM NEW.date THEN
    PERFORM recalc_plan_totals_for_date(OLD.date);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS batch_portions_totals ON batch_portions;
CREATE TRIGGER batch_portions_totals
  AFTER INSERT OR UPDATE OR DELETE ON batch_portions
  FOR EACH ROW EXECUTE FUNCTION trg_batch_portions_totals();

-- 4. Trigger auf prep_batches ----------------------------------------------
--
-- Aendert sich die Portionenzahl oder ein eingefrorener Wert, muessen alle
-- Tage nachziehen, an denen Boxen dieses Topfes liegen.

CREATE OR REPLACE FUNCTION trg_prep_batches_totals() RETURNS TRIGGER AS $$
DECLARE
  d DATE;
BEGIN
  FOR d IN
    SELECT DISTINCT bp.date FROM batch_portions bp
    WHERE bp.batch_id = COALESCE(NEW.id, OLD.id)
  LOOP
    PERFORM recalc_plan_totals_for_date(d);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prep_batches_totals ON prep_batches;
CREATE TRIGGER prep_batches_totals
  AFTER UPDATE OR DELETE ON prep_batches
  FOR EACH ROW EXECUTE FUNCTION trg_prep_batches_totals();

-- 5. Rezeptaenderung auf geplante Zyklen durchreichen ----------------------
--
-- Solange ein Zyklus 'geplant' ist, folgen die Batch-Werte dem Rezept.
-- Ab 'eingekauft' bleiben sie eingefroren.

-- Umrechnung Menge+Einheit -> Faktor relativ zu 100 Basiseinheiten.
-- Spiegelt toFactor() aus lib/calculations.ts. Muss VOR der Verwendung stehen.
CREATE OR REPLACE FUNCTION portion_factor(p_amount NUMERIC, p_unit TEXT) RETURNS NUMERIC AS $$
  SELECT CASE p_unit
    WHEN 'g'   THEN p_amount / 100
    WHEN 'ml'  THEN p_amount / 100
    WHEN 'dl'  THEN p_amount           -- 1 dl = 100 ml
    WHEN 'l'   THEN p_amount * 10      -- 1 l  = 1000 ml
    WHEN 'stk' THEN p_amount           -- *_per_100 haelt hier den Wert pro Stueck
    ELSE p_amount / 100
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Die Werte pro Portion einmal ausrechnen und dann setzen -- alle Toepfe
-- desselben Rezepts teilen sie ohnehin.
--
-- Ein frueherer Entwurf machte das ueber LATERAL in der FROM-Liste des UPDATE
-- und referenzierte dort die Zieltabelle. Das ist in Postgres nicht erlaubt
-- (ERROR 42P10) und liess jedes INSERT auf recipe_items scheitern. Migration
-- 0009 korrigiert bereits ausgerollte Datenbanken; hier steht die richtige
-- Fassung, damit eine frische Datenbank den Fehler gar nicht erst bekommt.
--
-- Gerundet wird wie in calcNutrition(): jede Position auf eine
-- Nachkommastelle, Kosten auf drei.
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

CREATE OR REPLACE FUNCTION trg_recipe_items_batches() RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalc_planned_batches_for_recipe(COALESCE(NEW.recipe_id, OLD.recipe_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recipe_items_batches ON recipe_items;
CREATE TRIGGER recipe_items_batches
  AFTER INSERT OR UPDATE OR DELETE ON recipe_items
  FOR EACH ROW EXECUTE FUNCTION trg_recipe_items_batches();

-- 6. RLS -------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['prep_cycles','prep_batches','batch_portions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', t);
    EXECUTE format('CREATE POLICY allow_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- 7. Verifikation ----------------------------------------------------------
--
-- Es gibt noch keine Zyklen, also darf sich an den Tagessummen NICHTS aendern.
-- Nach dem Nachrechnen aller Tage muss der Regressionsvergleich weiter
-- 0 Zeilen liefern:
--
--   SELECT recalc_plan_totals_for_date(date) FROM meal_plans;
--
--   SELECT count(*) FROM meal_plans_snapshot_20260725 s
--   JOIN meal_plans p ON p.id = s.id
--   WHERE round(s.kcal_total,1)    IS DISTINCT FROM round(p.kcal_total,1)
--      OR round(s.protein_total,1) IS DISTINCT FROM round(p.protein_total,1)
--      OR round(s.cost_total,3)    IS DISTINCT FROM round(p.cost_total,3);
--
-- Erwartet: 0.
--
-- portion_factor Gegenprobe -- erwartet 9 | 6 | 3 | 3 | 15:
--   SELECT portion_factor(900,'g')   AS g,      -- 900 g   -> 9
--          portion_factor(600,'ml')  AS ml,     -- 600 ml  -> 6
--          portion_factor(3,'dl')    AS dl,     -- 3 dl    -> 3
--          portion_factor(3,'stk')   AS stk,    -- 3 Stk.  -> 3
--          portion_factor(1.5,'l')   AS l;      -- 1.5 l   -> 15
