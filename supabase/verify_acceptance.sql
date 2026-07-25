-- ============================================================================
-- verify_acceptance.sql
--
-- Prueft die Akzeptanzkriterien des Meal-Prep-Umbaus gegen die echte Datenbank.
-- Im Supabase SQL-Editor am Stueck ausfuehren.
--
-- Der Test legt eigene Daten an (Praefix "ZZ_TEST") und raeumt sie am Ende
-- wieder ab. Bestandsdaten werden nicht angefasst.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- A. Strukturprüfungen (Kriterien 9, 10)
-- ────────────────────────────────────────────────────────────────────────────

-- 'hauptmahlzeit' darf nirgends mehr vorkommen. Erwartet: legacy = 0 ueberall.
SELECT 'meals' AS tabelle, count(*) FILTER (WHERE meal_type = 'hauptmahlzeit') AS legacy, count(*) AS gesamt FROM meals
UNION ALL SELECT 'recipes', count(*) FILTER (WHERE meal_type = 'hauptmahlzeit'), count(*) FROM recipes
UNION ALL SELECT 'prep_batches', count(*) FILTER (WHERE meal_type = 'hauptmahlzeit'), count(*) FROM prep_batches;

-- Vorlagen und Notizen vollstaendig migriert.
-- Erwartet nach 0010: alte Tabellen weg, Backups da.
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN
       ('meal_templates','meal_template_items','notes','note_items',
        'plan_templates','plan_template_days','plan_template_meals','plan_template_items',
        'grosse_menus','grosse_menu_meals','grosse_menu_items','menu_distribution_log')
  ) AS alte_tabellen_erwartet_0,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name LIKE '%\_backup\_20260725'
  ) AS backups_erwartet_11,
  -- 49 aus meal_templates + 0 aus notes + 1 aus grosse_menu_meals = 50,
  -- plus alles, was seither von Hand angelegt wurde.
  (SELECT count(*) FROM recipes) AS rezepte_mindestens_50;

-- ────────────────────────────────────────────────────────────────────────────
-- B. Nährwert-Regression (Kriterium 11)
-- ────────────────────────────────────────────────────────────────────────────
--
-- RUNDUNGSTOLERANZ, bewusst gesetzt:
--
-- Das alte Frontend rundete in sumItems() die LAUFENDE Summe nach jeder
-- Addition:
--
--   kcal: Math.round((acc.kcal + item.kcal) * 10) / 10
--
-- Die Trigger summieren stattdessen die gespeicherten Positionswerte und
-- runden einmal am Ende. An Tagen mit vielen Positionen schaukelt sich das um
-- eine Rundungseinheit auf. Der neue Wert ist der genauere.
--
-- Gemessen am 2026-07-25 nach Migration 0009: genau ein Tag (2026-07-02)
-- weicht ab, um +0.10 kcal, +0.10 g Protein und +0.0010 CHF -- jeweils exakt
-- eine Einheit. Kein Datenverlust, sondern behobene Ungenauigkeit.
--
-- Die Toleranz liegt deshalb bei einer halben Anzeigeeinheit. ECHTE
-- Regressionen -- eine verlorene Mahlzeit, eine doppelt gezaehlte Box --
-- liegen um Groessenordnungen darueber und werden weiterhin gefunden.
--
-- Muss 0 Zeilen liefern.
SELECT s.date,
       s.kcal_total    AS alt_kcal,   p.kcal_total    AS neu_kcal,
       p.kcal_total    - s.kcal_total    AS diff_kcal,
       s.protein_total AS alt_prot,   p.protein_total AS neu_prot,
       p.protein_total - s.protein_total AS diff_prot,
       s.cost_total    AS alt_kosten, p.cost_total    AS neu_kosten,
       p.cost_total    - s.cost_total    AS diff_kosten
FROM meal_plans_snapshot_20260725 s
JOIN meal_plans p ON p.id = s.id
WHERE abs(p.kcal_total    - s.kcal_total)    > 0.5
   OR abs(p.protein_total - s.protein_total) > 0.5
   OR abs(p.cost_total    - s.cost_total)    > 0.01;

-- Zur Einordnung: wie viele Tage weichen ueberhaupt ab, und wie stark?
-- Erwartet: hoechstens eine Handvoll, alle im Zehntelbereich.
SELECT count(*)                                   AS tage_mit_abweichung,
       round(max(abs(p.kcal_total - s.kcal_total)), 3) AS groesste_kcal_diff,
       round(max(abs(p.cost_total - s.cost_total)), 4) AS groesste_kosten_diff
FROM meal_plans_snapshot_20260725 s
JOIN meal_plans p ON p.id = s.id
WHERE round(s.kcal_total, 1)    IS DISTINCT FROM round(p.kcal_total, 1)
   OR round(s.protein_total, 1) IS DISTINCT FROM round(p.protein_total, 1)
   OR round(s.cost_total, 3)    IS DISTINCT FROM round(p.cost_total, 3);

-- ────────────────────────────────────────────────────────────────────────────
-- C. Kernlogik (Kriterien 1, 3, 4) — mit Testdaten
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_food   UUID;
  v_rez_a  UUID;
  v_rez_b  UUID;
  v_cycle  UUID;
  v_batch_a UUID;
  v_batch_b UUID;
  v_portion UUID;
  v_start  DATE := CURRENT_DATE + 400;   -- weit in der Zukunft, stoert nichts
  v_total  NUMERIC;
  v_rows   INT;
  v_boxes  INT;
BEGIN
  -- Testlebensmittel: 100 kcal / 2 g Protein / CHF 1.00 pro 100 g
  INSERT INTO foods (name, calories_per_100, protein_per_100, carbs_per_100, fat_per_100, cost_per_100, unit)
  VALUES ('ZZ_TEST Kartoffeln', 100, 2, 20, 0.1, 1.00, 'g')
  RETURNING id INTO v_food;

  -- Rezept A: Mittag, 300 g pro Portion
  INSERT INTO recipes (name, meal_type, status) VALUES ('ZZ_TEST Mittag', 'mittagessen', 'bereit')
  RETURNING id INTO v_rez_a;
  INSERT INTO recipe_items (recipe_id, food_id, food_name, amount_per_portion, unit)
  VALUES (v_rez_a, v_food, 'ZZ_TEST Kartoffeln', 300, 'g');

  -- Rezept B: Abend, 200 g pro Portion
  INSERT INTO recipes (name, meal_type, status) VALUES ('ZZ_TEST Abend', 'abendessen', 'bereit')
  RETURNING id INTO v_rez_b;
  INSERT INTO recipe_items (recipe_id, food_id, food_name, amount_per_portion, unit)
  VALUES (v_rez_b, v_food, 'ZZ_TEST Kartoffeln', 200, 'g');

  -- Zyklus ueber 3 Tage
  INSERT INTO prep_cycles (name, cook_date, start_date, end_date, status)
  VALUES ('ZZ_TEST Zyklus', v_start, v_start, v_start + 2, 'geplant')
  RETURNING id INTO v_cycle;

  -- Zwei Toepfe a 3 Portionen. Werte pro Portion wie im Frontend gerechnet:
  -- 300 g -> 300 kcal, 6 g Protein, CHF 3.00 | 200 g -> 200 kcal, 4 g, CHF 2.00
  INSERT INTO prep_batches (cycle_id, recipe_id, meal_type, portions,
                            kcal_per_portion, protein_per_portion, carbs_per_portion,
                            fat_per_portion, cost_per_portion)
  VALUES (v_cycle, v_rez_a, 'mittagessen', 3, 300, 6, 60, 0.3, 3.0000)
  RETURNING id INTO v_batch_a;

  INSERT INTO prep_batches (cycle_id, recipe_id, meal_type, portions,
                            kcal_per_portion, protein_per_portion, carbs_per_portion,
                            fat_per_portion, cost_per_portion)
  VALUES (v_cycle, v_rez_b, 'abendessen', 3, 200, 4, 40, 0.2, 2.0000)
  RETURNING id INTO v_batch_b;

  -- Tagesplaene und Boxen: eine pro Tag und Slot
  INSERT INTO meal_plans (date) VALUES (v_start), (v_start + 1), (v_start + 2);

  INSERT INTO batch_portions (batch_id, date, meal_type) VALUES
    (v_batch_a, v_start, 'mittagessen'), (v_batch_a, v_start + 1, 'mittagessen'), (v_batch_a, v_start + 2, 'mittagessen'),
    (v_batch_b, v_start, 'abendessen'),  (v_batch_b, v_start + 1, 'abendessen'),  (v_batch_b, v_start + 2, 'abendessen');

  -- ── Kriterium 1a: Kochliste rechnet hoch ────────────────────────────────
  SELECT ri.amount_per_portion * pb.portions INTO v_total
  FROM prep_batches pb JOIN recipe_items ri ON ri.recipe_id = pb.recipe_id
  WHERE pb.id = v_batch_a;
  RAISE NOTICE 'K1a Topf Mittag: % g (erwartet 900)', v_total;
  ASSERT v_total = 900, 'K1a fehlgeschlagen: Topf Mittag ist nicht 900 g';

  SELECT ri.amount_per_portion * pb.portions INTO v_total
  FROM prep_batches pb JOIN recipe_items ri ON ri.recipe_id = pb.recipe_id
  WHERE pb.id = v_batch_b;
  RAISE NOTICE 'K1b Topf Abend: % g (erwartet 600)', v_total;
  ASSERT v_total = 600, 'K1b fehlgeschlagen: Topf Abend ist nicht 600 g';

  -- ── Kriterium 1c: Einkaufsliste aggregiert zu EINER Position ────────────
  SELECT count(*), max(total_amount) INTO v_rows, v_total
  FROM cycle_shopping_items(v_cycle)
  WHERE food_name = 'ZZ_TEST Kartoffeln';
  RAISE NOTICE 'K1c Einkauf: % Position(en), % g (erwartet 1 / 1500)', v_rows, v_total;
  ASSERT v_rows = 1,      'K1c fehlgeschlagen: Kartoffeln erscheinen nicht als EINE Position';
  ASSERT v_total = 1500,  'K1c fehlgeschlagen: Gesamtmenge ist nicht 1500 g';

  -- ── Tagessummen aus Boxen (Trigger aus 0007) ────────────────────────────
  SELECT kcal_total INTO v_total FROM meal_plans WHERE date = v_start;
  RAISE NOTICE 'Tagessumme Tag 1: % kcal (erwartet 500)', v_total;
  ASSERT v_total = 500, 'Tagessumme falsch: Boxen zaehlen nicht in meal_plans';

  -- ── Kriterium 3: Portionenzahl aendern zieht Kosten nach ────────────────
  UPDATE prep_batches SET portions = 2 WHERE id = v_batch_a;
  SELECT count(*) INTO v_boxes FROM batch_portions WHERE batch_id = v_batch_a;
  RAISE NOTICE 'K3 Boxen nach Reduktion: % (DB-seitig unveraendert, das Angleichen macht lib/db/cycles.ts)', v_boxes;

  SELECT total_amount INTO v_total
  FROM cycle_shopping_items(v_cycle) WHERE food_name = 'ZZ_TEST Kartoffeln';
  RAISE NOTICE 'K3 Einkauf nach 3->2 Portionen: % g (erwartet 1200)', v_total;
  ASSERT v_total = 1200, 'K3 fehlgeschlagen: Einkaufsmenge folgt der Portionenzahl nicht';
  UPDATE prep_batches SET portions = 3 WHERE id = v_batch_a;

  -- ── Kriterium 4: Box verschieben, beide Tage stimmen danach ─────────────
  --
  -- Zieltag UND Slot wechseln: batch_portions hat UNIQUE (batch_id, date,
  -- meal_type), und Topf A belegt an Tag 2 bereits den Mittagessen-Slot.
  SELECT id INTO v_portion FROM batch_portions
  WHERE batch_id = v_batch_a AND date = v_start LIMIT 1;
  UPDATE batch_portions SET date = v_start + 1, meal_type = 'snack' WHERE id = v_portion;

  SELECT kcal_total INTO v_total FROM meal_plans WHERE date = v_start;
  RAISE NOTICE 'K4 Tag 1 nach Verschieben: % kcal (erwartet 200)', v_total;
  ASSERT v_total = 200, 'K4 fehlgeschlagen: Quelltag wurde nicht neu gerechnet';

  SELECT kcal_total INTO v_total FROM meal_plans WHERE date = v_start + 1;
  RAISE NOTICE 'K4 Tag 2 nach Verschieben: % kcal (erwartet 800)', v_total;
  ASSERT v_total = 800, 'K4 fehlgeschlagen: Zieltag wurde nicht neu gerechnet';

  -- ── portion_factor gegen lib/calculations.ts ────────────────────────────
  ASSERT portion_factor(900, 'g')  = 9,  'portion_factor g falsch';
  ASSERT portion_factor(600, 'ml') = 6,  'portion_factor ml falsch';
  ASSERT portion_factor(3, 'dl')   = 3,  'portion_factor dl falsch';
  ASSERT portion_factor(3, 'stk')  = 3,  'portion_factor stk falsch';
  ASSERT portion_factor(1.5, 'l')  = 15, 'portion_factor l falsch';

  RAISE NOTICE '── ALLE KERNLOGIK-KRITERIEN BESTANDEN ──';

  -- ── Aufräumen ───────────────────────────────────────────────────────────
  DELETE FROM prep_cycles WHERE id = v_cycle;                 -- kaskadiert auf Batches/Boxen
  DELETE FROM meal_plans  WHERE date BETWEEN v_start AND v_start + 2;
  DELETE FROM recipes     WHERE id IN (v_rez_a, v_rez_b);     -- kaskadiert auf recipe_items
  DELETE FROM foods       WHERE id = v_food;

  RAISE NOTICE 'Testdaten entfernt.';
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- D. Kontrolle, dass wirklich nichts zurückblieb
-- ────────────────────────────────────────────────────────────────────────────

SELECT
  (SELECT count(*) FROM foods       WHERE name LIKE 'ZZ_TEST%') AS foods,
  (SELECT count(*) FROM recipes     WHERE name LIKE 'ZZ_TEST%') AS rezepte,
  (SELECT count(*) FROM prep_cycles WHERE name LIKE 'ZZ_TEST%') AS zyklen;
-- Erwartet: 0 | 0 | 0

-- Und die Regression noch einmal, nach allen Testschreibvorgaengen.
-- Mit derselben Rundungstoleranz wie in Abschnitt B.
SELECT count(*) AS abweichungen_erwartet_0
FROM meal_plans_snapshot_20260725 s
JOIN meal_plans p ON p.id = s.id
WHERE abs(p.kcal_total    - s.kcal_total)    > 0.5
   OR abs(p.protein_total - s.protein_total) > 0.5
   OR abs(p.cost_total    - s.cost_total)    > 0.01;
