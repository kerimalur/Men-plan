-- ============================================================================
-- 0006_recipes_migrate_data.sql
--
-- Bestandsdaten nach recipes / recipe_items ueberfuehren.
--
-- Drei Quellen:
--   meal_templates + meal_template_items   49 / 193 Zeilen
--   notes + note_items                      0 /   0 Zeilen (No-Op, muss trotzdem stimmen)
--   grosse_menus + ...                      1 Menue, 1 Mahlzeit, 5 Positionen
--
-- Zwei Eigenheiten der Ist-Daten, die der Umbau-Auftrag nicht kennt:
--
--   1. meal_template_items hat KEIN food_name -- nur food_id. Der Name muss
--      aus foods gejoint werden, mit Fallback 'Unbekannt'.
--   2. meal_templates.category ist TEXT, nicht category_id. Die drei
--      vorkommenden Werte werden zuerst nach template_categories gehoben.
--
-- grosse_menus fuehrt Mengen als TOTAL fuer alle Tage. Beim Uebertragen wird
-- deshalb durch num_days geteilt -- das ist genau die Umkehrung dessen, was der
-- Prep-Zyklus spaeter wieder hochrechnet.
--
-- Idempotent ueber recipes.source_ref: bereits uebernommene Zeilen werden
-- uebersprungen. Mehrfaches Ausfuehren aendert die Zahlen nicht.
-- ============================================================================

-- 1. Kategorien aus den TEXT-Werten heben ---------------------------------

INSERT INTO template_categories (name)
SELECT DISTINCT t.category
FROM meal_templates t
WHERE t.category IS NOT NULL
  AND btrim(t.category) <> ''
  AND NOT EXISTS (SELECT 1 FROM template_categories tc WHERE tc.name = t.category);

-- 2. meal_templates -> recipes --------------------------------------------

INSERT INTO recipes (name, meal_type, category_id, status, freetext, default_portions, source_ref)
SELECT
  t.name,
  t.meal_type,
  (SELECT tc.id FROM template_categories tc WHERE tc.name = t.category),
  'bereit',
  '',
  3,
  'mt:' || t.id
FROM meal_templates t
WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE r.source_ref = 'mt:' || t.id);

-- Positionen: Menge galt bisher fuer EINE Portion, wird also 1:1 uebernommen.
INSERT INTO recipe_items (recipe_id, food_id, food_name, amount_per_portion, unit, sort_order)
SELECT
  r.id,
  i.food_id,
  COALESCE(f.name, 'Unbekannt'),
  i.amount,
  CASE WHEN i.unit IN ('g','ml','dl','l','stk') THEN i.unit ELSE 'g' END,
  row_number() OVER (PARTITION BY i.template_id ORDER BY i.created_at, i.id)
FROM meal_template_items i
JOIN recipes r     ON r.source_ref = 'mt:' || i.template_id
LEFT JOIN foods f  ON f.id = i.food_id
WHERE NOT EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.recipe_id = r.id);

-- 3. notes -> recipes ------------------------------------------------------

INSERT INTO recipes (name, meal_type, status, freetext, default_portions, source_ref)
SELECT
  COALESCE(NULLIF(btrim(n.title), ''), 'Unbenannte Notiz'),
  COALESCE(n.meal_type, 'mittagessen'),
  COALESCE(n.status, 'idee'),
  COALESCE(n.freetext, ''),
  3,
  'note:' || n.id
FROM notes n
WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE r.source_ref = 'note:' || n.id);

INSERT INTO recipe_items (recipe_id, food_id, food_name, amount_per_portion, unit, sort_order)
SELECT
  r.id,
  ni.food_id,
  ni.food_name,
  COALESCE(ni.amount, 0),
  CASE WHEN COALESCE(ni.unit,'g') IN ('g','ml','dl','l','stk') THEN COALESCE(ni.unit,'g') ELSE 'g' END,
  COALESCE(ni.sort_order, 0)
FROM note_items ni
JOIN recipes r ON r.source_ref = 'note:' || ni.note_id
WHERE NOT EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.recipe_id = r.id);

-- 4. grosse_menus -> recipes ----------------------------------------------
--
-- Entscheidung des Nutzers vom 2026-07-25: die grossen Menues werden durch
-- Prep-Zyklen abgeloest, nicht parallel weitergefuehrt.

INSERT INTO recipes (name, meal_type, status, freetext, default_portions, source_ref)
SELECT
  gm.name || ' — ' || g.name,
  gm.meal_type,
  'bereit',
  '',
  GREATEST(g.num_days, 1),
  'gm:' || gm.id
FROM grosse_menu_meals gm
JOIN grosse_menus g ON g.id = gm.menu_id
WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE r.source_ref = 'gm:' || gm.id);

-- Mengen sind Totale fuer num_days Tage -> auf eine Portion herunterrechnen.
INSERT INTO recipe_items (recipe_id, food_id, food_name, amount_per_portion, unit, sort_order)
SELECT
  r.id,
  i.food_id,
  i.food_name,
  ROUND(i.amount / GREATEST(g.num_days, 1), 2),
  CASE WHEN i.unit IN ('g','ml','dl','l','stk') THEN i.unit ELSE 'g' END,
  row_number() OVER (PARTITION BY i.menu_meal_id ORDER BY i.created_at, i.id)
FROM grosse_menu_items i
JOIN grosse_menu_meals gm ON gm.id = i.menu_meal_id
JOIN grosse_menus g       ON g.id  = gm.menu_id
JOIN recipes r            ON r.source_ref = 'gm:' || gm.id
WHERE NOT EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.recipe_id = r.id);

-- 5. Namenskollisionen aufloesen ------------------------------------------
--
-- Nichts ueberschreiben: Duplikate bekommen ein Suffix, das aelteste Rezept
-- behaelt seinen Namen.

WITH d AS (
  SELECT id, row_number() OVER (PARTITION BY lower(btrim(name)) ORDER BY created_at, id) AS rn
  FROM recipes
)
UPDATE recipes r
SET name = r.name || ' (' || d.rn || ')'
FROM d
WHERE d.id = r.id AND d.rn > 1;

-- 6. event_meal_rules auf recipes umhaengen -------------------------------

UPDATE event_meal_rules e
SET recipe_id = r.id
FROM recipes r
WHERE e.recipe_id IS NULL
  AND e.template_id IS NOT NULL
  AND r.source_ref = 'mt:' || e.template_id;

-- 7. Verifikation ----------------------------------------------------------
--
-- Erwartet: mt = r_mt = 49 · mti = r_mti = 193 · gmi = r_gmi = 5 · dupes = 0
--
--   SELECT
--     (SELECT count(*) FROM meal_templates)      AS mt,
--     (SELECT count(*) FROM recipes WHERE source_ref LIKE 'mt:%')  AS r_mt,
--     (SELECT count(*) FROM meal_template_items) AS mti,
--     (SELECT count(*) FROM recipe_items ri JOIN recipes r ON r.id = ri.recipe_id
--        WHERE r.source_ref LIKE 'mt:%')         AS r_mti,
--     (SELECT count(*) FROM grosse_menu_items)   AS gmi,
--     (SELECT count(*) FROM recipe_items ri JOIN recipes r ON r.id = ri.recipe_id
--        WHERE r.source_ref LIKE 'gm:%')         AS r_gmi,
--     (SELECT count(*) FROM (
--        SELECT lower(btrim(name)) FROM recipes GROUP BY 1 HAVING count(*) > 1
--      ) x)                                      AS dupes;
--
-- Verteilung der Rezepte:
--   SELECT meal_type, count(*) FROM recipes GROUP BY 1 ORDER BY 1;
--
-- Zutaten ohne aufloesbares Lebensmittel (sollten 0 sein, sonst wurde ein
-- food geloescht, bevor die Vorlage migriert wurde):
--   SELECT count(*) FROM recipe_items WHERE food_name = 'Unbekannt';
--
-- Idempotenz: Migration ein zweites Mal ausfuehren, dieselben Zahlen erwarten.
