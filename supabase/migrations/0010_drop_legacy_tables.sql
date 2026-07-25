-- ============================================================================
-- 0010_drop_legacy_tables.sql
--
-- ERST AUSFUEHREN, wenn 0006 verifiziert ist.
--
-- Diese Migration entfernt die abgeloesten Tabellen. Die in 0005 angelegten
-- Backups (*_backup_20260725) bleiben bestehen -- sie sind die letzte
-- Rueckfallebene und werden bewusst NICHT mitgeloescht.
--
-- Vorbedingung pruefen (muss true liefern):
--
--   SELECT
--     (SELECT count(*) FROM meal_templates)
--       = (SELECT count(*) FROM recipes WHERE source_ref LIKE 'mt:%')
--     AND (SELECT count(*) FROM meal_template_items)
--       = (SELECT count(*) FROM recipe_items ri JOIN recipes r ON r.id = ri.recipe_id
--          WHERE r.source_ref LIKE 'mt:%')
--     AND (SELECT count(*) FROM grosse_menu_items)
--       = (SELECT count(*) FROM recipe_items ri JOIN recipes r ON r.id = ri.recipe_id
--          WHERE r.source_ref LIKE 'gm:%')
--     AS migration_vollstaendig;
--
-- Liefert das false, NICHT weitermachen.
--
-- Idempotent: DROP TABLE IF EXISTS.
-- ============================================================================

-- 1. event_meal_rules endgueltig von template_id loesen --------------------

ALTER TABLE event_meal_rules DROP COLUMN IF EXISTS template_id;
ALTER TABLE event_meal_rules ALTER COLUMN recipe_id SET NOT NULL;

-- 2. Abgeloeste Tabellen entfernen ----------------------------------------
--
-- Reihenfolge beachtet die Fremdschluessel: Kinder vor Eltern.

DROP TABLE IF EXISTS menu_distribution_log;
DROP TABLE IF EXISTS grosse_menu_items;
DROP TABLE IF EXISTS grosse_menu_meals;
DROP TABLE IF EXISTS grosse_menus;

DROP TABLE IF EXISTS plan_template_items;
DROP TABLE IF EXISTS plan_template_meals;
DROP TABLE IF EXISTS plan_template_days;
DROP TABLE IF EXISTS plan_templates;

DROP TABLE IF EXISTS note_items;
DROP TABLE IF EXISTS notes;

DROP TABLE IF EXISTS meal_template_items;
DROP TABLE IF EXISTS meal_templates;

-- 3. Verifikation ----------------------------------------------------------
--
-- Keine der alten Tabellen darf uebrig sein:
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('meal_templates','meal_template_items','notes','note_items',
--                        'plan_templates','plan_template_days','plan_template_meals',
--                        'plan_template_items','grosse_menus','grosse_menu_meals',
--                        'grosse_menu_items','menu_distribution_log');
--
-- Erwartet: 0 Zeilen.
--
-- Die Backups muessen dagegen noch da sein:
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE '%_backup_20260725'
--   ORDER BY 1;
--
-- Erwartet: 11 Zeilen.
--
-- Und die Naehrwerte der historischen Tage muessen weiterhin stimmen:
--
--   SELECT count(*) FROM meal_plans_snapshot_20260725 s
--   JOIN meal_plans p ON p.id = s.id
--   WHERE round(s.kcal_total,1)    IS DISTINCT FROM round(p.kcal_total,1)
--      OR round(s.protein_total,1) IS DISTINCT FROM round(p.protein_total,1)
--      OR round(s.cost_total,3)    IS DISTINCT FROM round(p.cost_total,3);
--
-- Erwartet: 0.
