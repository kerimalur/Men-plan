-- ============================================================================
-- 0008_shopping_aggregate.sql
--
-- Einkaufsliste ueber den Zyklus statt ueber einen Datumsbereich.
--
-- Ersetzt die vier sequentiellen Queries in syncFromPlan() durch eine einzige
-- RPC. Entscheidend ist die Aggregation ueber ALLE Toepfe des Zyklus hinweg:
--
--   Topf Mittag  300 g Kartoffeln/Portion x 3 = 900 g
--   Topf Abend   200 g Kartoffeln/Portion x 3 = 600 g
--   -> EINE Position Kartoffeln mit 1500 g, nicht zwei Positionen
--
-- Zusaetzlich zaehlen die frei geplanten Einzelmahlzeiten im selben Zeitraum
-- mit -- sonst fehlt der Einkauf fuer die freien Tage.
--
-- Einheiten werden vor dem Gruppieren auf die Basis normalisiert (dl und l
-- werden zu ml), damit sich 6 dl und 400 ml zu 1 l addieren statt zu "406".
--
-- Gruppiert wird nach food_id; fehlt die (Lebensmittel geloescht oder
-- Direkteingabe), dient der normalisierte Name als Schluessel.
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

-- Menge in Basis-Einheit. Spiegelt toBaseUnit() aus lib/units.ts.
CREATE OR REPLACE FUNCTION to_base_amount(p_amount NUMERIC, p_unit TEXT) RETURNS NUMERIC AS $$
  SELECT CASE p_unit
    WHEN 'dl' THEN p_amount * 100
    WHEN 'l'  THEN p_amount * 1000
    ELSE p_amount
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION to_base_unit(p_unit TEXT) RETURNS TEXT AS $$
  SELECT CASE p_unit
    WHEN 'dl'  THEN 'ml'
    WHEN 'l'   THEN 'ml'
    WHEN 'ml'  THEN 'ml'
    WHEN 'stk' THEN 'stk'
    ELSE 'g'
  END;
$$ LANGUAGE sql IMMUTABLE;

DROP FUNCTION IF EXISTS cycle_shopping_items(UUID);

CREATE OR REPLACE FUNCTION cycle_shopping_items(p_cycle_id UUID)
RETURNS TABLE (
  food_id      UUID,
  food_name    TEXT,
  unit         TEXT,
  total_amount NUMERIC,
  sources      JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH cycle AS (
    SELECT id, start_date, end_date FROM prep_cycles WHERE id = p_cycle_id
  ),
  -- Mengen aus den Toepfen: pro Portion mal Anzahl Boxen.
  batch_src AS (
    SELECT
      ri.food_id,
      ri.food_name,
      to_base_unit(ri.unit)                                         AS unit,
      to_base_amount(ri.amount_per_portion, ri.unit) * pb.portions   AS amount,
      'Topf ' || r.name                                             AS source
    FROM prep_batches pb
    JOIN recipes r       ON r.id = pb.recipe_id
    JOIN recipe_items ri ON ri.recipe_id = r.id
    WHERE pb.cycle_id = p_cycle_id
  ),
  -- Frei geplante Einzelmahlzeiten im selben Zeitraum.
  free_src AS (
    SELECT
      mi.food_id,
      mi.food_name,
      to_base_unit(mi.unit)                    AS unit,
      to_base_amount(mi.amount, mi.unit)       AS amount,
      m.name                                   AS source
    FROM meal_items mi
    JOIN meals m      ON m.id = mi.meal_id
    JOIN meal_plans p ON p.id = m.plan_id
    JOIN cycle c      ON p.date BETWEEN c.start_date AND c.end_date
  ),
  all_src AS (
    SELECT * FROM batch_src
    UNION ALL
    SELECT * FROM free_src
  )
  SELECT
    -- Irgendeine nicht-leere food_id der Gruppe. array_agg mit FILTER statt
    -- min(uuid): funktioniert unabhaengig von der Postgres-Version und sagt
    -- deutlicher, was gemeint ist -- die Gruppe hat per Definition hoechstens
    -- eine food_id.
    (array_agg(s.food_id) FILTER (WHERE s.food_id IS NOT NULL))[1] AS food_id,
    MIN(s.food_name)                                  AS food_name,
    MIN(s.unit)                                       AS unit,
    ROUND(SUM(s.amount), 2)                           AS total_amount,
    jsonb_agg(
      jsonb_build_object('source', s.source, 'amount', ROUND(s.amount, 2))
      ORDER BY s.source
    )                                                 AS sources
  FROM all_src s
  GROUP BY COALESCE(s.food_id::text, lower(btrim(s.food_name)))
  ORDER BY 2;
$$;

-- Verifikation --------------------------------------------------------------
--
-- Mit einem Testzyklus (Rezept A 300 g/Portion Mittag, Rezept B 200 g/Portion
-- Abend, je 3 Portionen):
--
--   SELECT food_name, total_amount, sources
--   FROM cycle_shopping_items('<test-id>')
--   WHERE food_name ILIKE '%kartoffel%';
--
-- Erwartet: GENAU EINE Zeile, total_amount = 1500, sources mit zwei Eintraegen
-- (900 aus Topf A, 600 aus Topf B).
--
-- Einheiten-Normalisierung:
--   SELECT to_base_amount(6,'dl'), to_base_amount(1.5,'l'), to_base_unit('dl');
-- Erwartet: 600 | 1500 | ml
