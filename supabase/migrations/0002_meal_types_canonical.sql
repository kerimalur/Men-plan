-- ============================================================================
-- 0002_meal_types_canonical.sql
--
-- Ein einziger kanonischer Satz Mahlzeit-Typen ueber alle Tabellen:
--   fruehstueck | mittagessen | abendessen | snack
--
-- Der Legacy-Wert 'hauptmahlzeit' wird endgueltig auf 'mittagessen' migriert
-- und aus saemtlichen CHECK-Constraints entfernt. Im Frontend entfallen
-- normaliseMealType() und die Rueckkonvertierung in handleSave() ersatzlos.
--
-- Betroffene Bestandsdaten (Stand 2026-07-25):
--   meal_templates       41 Zeilen 'hauptmahlzeit'
--   plan_template_meals   2 Zeilen 'hauptmahlzeit'
--   notes                 0 Zeilen
--   event_meal_rules      0 Zeilen
--   meals                 0 Zeilen (bereits kanonisch)
--
-- ----------------------------------------------------------------------------
-- REIHENFOLGE IST KRITISCH: erst Constraints droppen, dann Daten aendern,
-- dann neue Constraints setzen.
--
-- meal_templates_meal_type_check erlaubt im Ausgangszustand NUR
-- ('fruehstueck','hauptmahlzeit','snack'). Ein UPDATE auf 'mittagessen' bei
-- noch aktivem Constraint scheitert deshalb mit:
--   ERROR 23514: new row for relation "meal_templates" violates check
--   constraint "meal_templates_meal_type_check"
-- ----------------------------------------------------------------------------
--
-- Hinweis zur Bedienung: meal_type ist ab hier ein Vorfilter, keine Sperre.
-- Die 41 vormaligen Hauptmahlzeiten landen alle auf 'mittagessen'; die
-- Rezeptauswahl im Prep-Planer filtert danach nur vor und bietet immer einen
-- Umschalter "alle Rezepte".
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

-- 1. Alte Constraints entfernen -------------------------------------------

ALTER TABLE meals               DROP CONSTRAINT IF EXISTS meals_meal_type_check;
ALTER TABLE meal_templates      DROP CONSTRAINT IF EXISTS meal_templates_meal_type_check;
ALTER TABLE plan_template_meals DROP CONSTRAINT IF EXISTS plan_template_meals_meal_type_check;
ALTER TABLE notes               DROP CONSTRAINT IF EXISTS notes_meal_type_check;
ALTER TABLE event_meal_rules    DROP CONSTRAINT IF EXISTS event_meal_rules_meal_type_check;
ALTER TABLE grosse_menu_meals   DROP CONSTRAINT IF EXISTS grosse_menu_meals_meal_type_check;

-- 2. Daten migrieren -------------------------------------------------------

UPDATE meal_templates      SET meal_type = 'mittagessen' WHERE meal_type = 'hauptmahlzeit';
UPDATE plan_template_meals SET meal_type = 'mittagessen' WHERE meal_type = 'hauptmahlzeit';
UPDATE notes               SET meal_type = 'mittagessen' WHERE meal_type = 'hauptmahlzeit';
UPDATE event_meal_rules    SET meal_type = 'mittagessen' WHERE meal_type = 'hauptmahlzeit';
UPDATE meals               SET meal_type = 'mittagessen' WHERE meal_type = 'hauptmahlzeit';
UPDATE grosse_menu_meals   SET meal_type = 'mittagessen' WHERE meal_type = 'hauptmahlzeit';

-- Sicherheitsnetz: alles, was jetzt noch ausserhalb der vier Werte liegt,
-- wuerde das Setzen der neuen Constraints scheitern lassen. Solche Zeilen
-- gibt es nach heutigem Stand nicht; falls doch, landen sie auf 'mittagessen'
-- statt die Migration abzubrechen.
UPDATE meal_templates      SET meal_type = 'mittagessen'
  WHERE meal_type NOT IN ('fruehstueck','mittagessen','abendessen','snack');
UPDATE plan_template_meals SET meal_type = 'mittagessen'
  WHERE meal_type NOT IN ('fruehstueck','mittagessen','abendessen','snack');
UPDATE meals               SET meal_type = 'mittagessen'
  WHERE meal_type NOT IN ('fruehstueck','mittagessen','abendessen','snack');
UPDATE event_meal_rules    SET meal_type = 'mittagessen'
  WHERE meal_type NOT IN ('fruehstueck','mittagessen','abendessen','snack');
UPDATE grosse_menu_meals   SET meal_type = 'mittagessen'
  WHERE meal_type NOT IN ('fruehstueck','mittagessen','abendessen','snack');

-- notes.meal_type ist nullable und bleibt es -- NULL heisst "noch nicht
-- zugeordnet". Erst die Migration nach recipes (0006) setzt dort 'mittagessen'.
UPDATE notes SET meal_type = 'mittagessen'
  WHERE meal_type IS NOT NULL
    AND meal_type NOT IN ('fruehstueck','mittagessen','abendessen','snack');

-- 3. Neue Constraints setzen -----------------------------------------------

ALTER TABLE meals ADD CONSTRAINT meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack'));

ALTER TABLE meal_templates ADD CONSTRAINT meal_templates_meal_type_check
  CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack'));

ALTER TABLE plan_template_meals ADD CONSTRAINT plan_template_meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack'));

ALTER TABLE event_meal_rules ADD CONSTRAINT event_meal_rules_meal_type_check
  CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack'));

ALTER TABLE grosse_menu_meals ADD CONSTRAINT grosse_menu_meals_meal_type_check
  CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack'));

-- notes erlaubt zusaetzlich NULL.
ALTER TABLE notes ADD CONSTRAINT notes_meal_type_check
  CHECK (meal_type IS NULL OR meal_type IN ('fruehstueck','mittagessen','abendessen','snack'));

-- 4. Verifikation ----------------------------------------------------------
--
-- Erwartet: sechs Zeilen, Spalte legacy ueberall 0.
--
--   SELECT 'meal_templates'      AS tabelle, count(*) FILTER (WHERE meal_type='hauptmahlzeit') AS legacy, count(*) AS gesamt FROM meal_templates
--   UNION ALL SELECT 'plan_template_meals', count(*) FILTER (WHERE meal_type='hauptmahlzeit'), count(*) FROM plan_template_meals
--   UNION ALL SELECT 'notes',               count(*) FILTER (WHERE meal_type='hauptmahlzeit'), count(*) FROM notes
--   UNION ALL SELECT 'event_meal_rules',    count(*) FILTER (WHERE meal_type='hauptmahlzeit'), count(*) FROM event_meal_rules
--   UNION ALL SELECT 'meals',               count(*) FILTER (WHERE meal_type='hauptmahlzeit'), count(*) FROM meals
--   UNION ALL SELECT 'grosse_menu_meals',   count(*) FILTER (WHERE meal_type='hauptmahlzeit'), count(*) FROM grosse_menu_meals;
--
-- Verteilung der Vorlagen danach -- die 41 vormaligen Hauptmahlzeiten muessen
-- als 'mittagessen' auftauchen, Summe 49:
--
--   SELECT meal_type, count(*) FROM meal_templates GROUP BY 1 ORDER BY 1;
