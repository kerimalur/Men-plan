-- ============================================================================
-- 0011_meal_items_eaten.sql
--
-- Einzelne Positionen abhakbar machen.
--
-- Anlass: an einem freien Tag legt der Nutzer EINE Mahlzeit ("Tagesaussicht")
-- mit acht Positionen an und isst davon ueber den Tag verteilt. Bisher liess
-- sich nur die ganze Mahlzeit abhaken -- die Zwischeninformation "drei von acht
-- gegessen" fehlte komplett.
--
-- Ab hier traegt jede Position ihr eigenes eaten. meals.eaten bleibt erhalten
-- und ist ab jetzt die ABLEITUNG daraus:
--
--   alle Positionen abgehakt   -> Mahlzeit gilt als gegessen
--   Mahlzeit abgehakt          -> alle Positionen gelten als gegessen
--
-- Beide Richtungen laufen in der Datenbank, nicht im Frontend. Damit ist der
-- Zustand konsistent, egal ob die Aenderung aus der App, aus dem SQL-Editor
-- oder aus einem spaeteren Import kommt.
--
-- Keine Rekursion zwischen den beiden Triggern: die Abwaertsrichtung
-- (meals -> meal_items) feuert nur, wenn das UPDATE direkt kam und nicht aus
-- sync_meal_eaten() -- geprueft mit pg_trigger_depth(). Ohne diese Bremse
-- wuerde das Abwaehlen EINER Position die Mahlzeit auf nicht-gegessen setzen
-- und dabei alle uebrigen Haekchen mit loeschen.
--
-- Naehrwerte aendert diese Migration NICHT. eaten ist reine Zusatzinformation;
-- meal_plans.kcal_total und Geschwister bleiben die GEPLANTE Summe. Was davon
-- bereits gegessen ist, rechnet die Tagesansicht aus den Positionen.
--
-- Idempotent und vorwaertsgerichtet.
-- ============================================================================

-- 1. Spalte ----------------------------------------------------------------
--
-- Dreischritt statt eines einzelnen ADD COLUMN ... NOT NULL: liegt die Spalte
-- aus einem frueheren Teil-Lauf schon nullable vor, greift ADD IF NOT EXISTS
-- nicht mehr und die Bedingung wuerde nie gesetzt.

ALTER TABLE meal_items ADD COLUMN IF NOT EXISTS eaten BOOLEAN DEFAULT FALSE;

UPDATE meal_items SET eaten = FALSE WHERE eaten IS NULL;

ALTER TABLE meal_items ALTER COLUMN eaten SET DEFAULT FALSE;
ALTER TABLE meal_items ALTER COLUMN eaten SET NOT NULL;

-- Bestandsdaten stehen damit ausnahmslos auf FALSE -- so verlangt es der
-- Auftrag. meals.eaten wird bewusst NICHT nach unten gespiegelt: die Spalte
-- existiert seit dem Baseline-Stand, wurde vom Frontend aber nie geschrieben
-- (setMealEaten() war bis zu diesem Umbau unbenutzt). Der Verifikationsblock
-- am Dateiende prueft das nach.

-- 2. Ableitung nach oben: Positionen -> Mahlzeit ---------------------------

CREATE OR REPLACE FUNCTION sync_meal_eaten(p_meal_id UUID) RETURNS VOID AS $$
DECLARE
  v_items INT;
  v_open  INT;
BEGIN
  IF p_meal_id IS NULL THEN RETURN; END IF;

  SELECT count(*), count(*) FILTER (WHERE NOT eaten)
    INTO v_items, v_open
  FROM meal_items WHERE meal_id = p_meal_id;

  -- Mahlzeit ohne Positionen: das Haekchen bleibt rein manuell, sonst wuerde
  -- "alle null Positionen sind gegessen" sie faelschlich als gegessen fuehren.
  IF v_items = 0 THEN RETURN; END IF;

  UPDATE meals SET eaten = (v_open = 0)
  WHERE id = p_meal_id
    AND COALESCE(eaten, FALSE) IS DISTINCT FROM (v_open = 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_meal_items_eaten() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_meal_eaten(OLD.meal_id);
    RETURN OLD;
  END IF;

  PERFORM sync_meal_eaten(NEW.meal_id);

  -- Position in eine andere Mahlzeit verschoben: beide neu bewerten.
  IF TG_OP = 'UPDATE' AND OLD.meal_id IS DISTINCT FROM NEW.meal_id THEN
    PERFORM sync_meal_eaten(OLD.meal_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meal_items_eaten ON meal_items;
CREATE TRIGGER meal_items_eaten
  AFTER INSERT OR UPDATE OR DELETE ON meal_items
  FOR EACH ROW EXECUTE FUNCTION trg_meal_items_eaten();

-- 3. Ableitung nach unten: Mahlzeit -> Positionen --------------------------

CREATE OR REPLACE FUNCTION trg_meals_eaten() RETURNS TRIGGER AS $$
BEGIN
  -- pg_trigger_depth() > 1 heisst: dieses UPDATE stammt aus sync_meal_eaten(),
  -- die Mahlzeit ist also nur der Ableitung ihrer Positionen gefolgt. Dann
  -- darf nichts zurueckgeschrieben werden.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  UPDATE meal_items SET eaten = COALESCE(NEW.eaten, FALSE)
  WHERE meal_id = NEW.id
    AND eaten IS DISTINCT FROM COALESCE(NEW.eaten, FALSE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meals_eaten ON meals;
CREATE TRIGGER meals_eaten
  AFTER UPDATE OF eaten ON meals
  FOR EACH ROW
  WHEN (OLD.eaten IS DISTINCT FROM NEW.eaten)
  EXECUTE FUNCTION trg_meals_eaten();

-- 4. Verifikation ----------------------------------------------------------
--
-- a) Keine Position ohne Wert, alle Bestandszeilen auf FALSE:
--
--   SELECT count(*) FILTER (WHERE eaten IS NULL) AS null_werte,   -- 0
--          count(*) FILTER (WHERE eaten)         AS abgehakt      -- 0 direkt
--   FROM meal_items;                                              --   nach der
--                                                                 --   Migration
--
-- b) meals.eaten wurde vom alten Frontend nie gesetzt -- erwartet 0:
--
--   SELECT count(*) FROM meals WHERE eaten;
--
--   Liefert das mehr als 0, gab es doch abgehakte Mahlzeiten. Deren Positionen
--   stehen jetzt auf FALSE. Bewusste Entscheidung nachziehen mit:
--     UPDATE meal_items i SET eaten = TRUE
--     FROM meals m WHERE m.id = i.meal_id AND m.eaten;
--
-- c) Naehrwerte unveraendert -- der Regressionsvergleich muss weiter
--    0 Zeilen liefern (siehe supabase/verify_acceptance.sql):
--
--   SELECT count(*) FROM meal_plans_snapshot_20260725 s
--   JOIN meal_plans p ON p.id = s.id
--   WHERE round(s.kcal_total,1)    IS DISTINCT FROM round(p.kcal_total,1)
--      OR round(s.protein_total,1) IS DISTINCT FROM round(p.protein_total,1)
--      OR round(s.cost_total,3)    IS DISTINCT FROM round(p.cost_total,3);
--
-- d) Kopplung beide Richtungen, an einer Testmahlzeit mit >= 2 Positionen:
--
--   -- alle abhaken -> Mahlzeit gegessen
--   UPDATE meal_items SET eaten = TRUE WHERE meal_id = '<id>';
--   SELECT eaten FROM meals WHERE id = '<id>';            -- t
--
--   -- eine abwaehlen -> Mahlzeit nicht mehr gegessen, REST BLEIBT abgehakt
--   UPDATE meal_items SET eaten = FALSE
--   WHERE id = (SELECT id FROM meal_items WHERE meal_id = '<id>' LIMIT 1);
--   SELECT eaten FROM meals WHERE id = '<id>';            -- f
--   SELECT count(*) FILTER (WHERE eaten) FROM meal_items
--   WHERE meal_id = '<id>';                               -- n-1, NICHT 0
--
--   -- Mahlzeit abhaken -> alle Positionen abgehakt
--   UPDATE meals SET eaten = TRUE WHERE id = '<id>';
--   SELECT count(*) FILTER (WHERE NOT eaten) FROM meal_items
--   WHERE meal_id = '<id>';                               -- 0
