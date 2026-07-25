-- ============================================================================
-- 0005_recipes.sql
--
-- Das neue Kernmodell: ein Rezept definiert Mengen PRO PORTION.
-- Alles Weitere -- Topfmenge, Boxen, Einkaufsliste -- ist Multiplikation.
--
-- Diese Migration legt nur Struktur und Backups an. Die Datenmigration aus
-- meal_templates, notes und grosse_menus passiert in 0006.
--
-- Idempotent: mehrfaches Ausfuehren ist folgenlos.
-- ============================================================================

-- 1. Backups VOR der Umstellung -------------------------------------------
--
-- Anforderung aus dem Umbau-Auftrag: vor Phase 1 und 2 jeweils Backup-Tabellen
-- anlegen. Die Quelltabellen selbst bleiben zunaechst bestehen und werden erst
-- in 0010 entfernt.

CREATE TABLE IF NOT EXISTS meal_templates_backup_20260725      AS SELECT * FROM meal_templates;
CREATE TABLE IF NOT EXISTS meal_template_items_backup_20260725 AS SELECT * FROM meal_template_items;
CREATE TABLE IF NOT EXISTS notes_backup_20260725               AS SELECT * FROM notes;
CREATE TABLE IF NOT EXISTS note_items_backup_20260725          AS SELECT * FROM note_items;
CREATE TABLE IF NOT EXISTS grosse_menus_backup_20260725        AS SELECT * FROM grosse_menus;
CREATE TABLE IF NOT EXISTS grosse_menu_meals_backup_20260725   AS SELECT * FROM grosse_menu_meals;
CREATE TABLE IF NOT EXISTS grosse_menu_items_backup_20260725   AS SELECT * FROM grosse_menu_items;
CREATE TABLE IF NOT EXISTS plan_templates_backup_20260725      AS SELECT * FROM plan_templates;
CREATE TABLE IF NOT EXISTS plan_template_days_backup_20260725  AS SELECT * FROM plan_template_days;
CREATE TABLE IF NOT EXISTS plan_template_meals_backup_20260725 AS SELECT * FROM plan_template_meals;
CREATE TABLE IF NOT EXISTS plan_template_items_backup_20260725 AS SELECT * FROM plan_template_items;

-- 2. recipes ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  meal_type        TEXT NOT NULL DEFAULT 'mittagessen'
                   CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack')),
  category_id      UUID REFERENCES template_categories(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'bereit'
                   CHECK (status IN ('idee','zutaten_erfasst','bereit')),
  freetext         TEXT NOT NULL DEFAULT '',
  default_portions INT  NOT NULL DEFAULT 3 CHECK (default_portions BETWEEN 1 AND 14),
  is_favorite      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Herkunftsschluessel, damit 0006 mehrfach laufen kann, ohne zu duplizieren.
-- Werte: 'mt:<uuid>' aus meal_templates, 'note:<uuid>', 'gm:<uuid>'.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS recipes_source_ref_key ON recipes(source_ref) WHERE source_ref IS NOT NULL;

-- 3. recipe_items ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS recipe_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id          UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_id            UUID REFERENCES foods(id) ON DELETE SET NULL,
  -- Fallback, falls das Lebensmittel spaeter geloescht wird.
  food_name          TEXT NOT NULL,
  amount_per_portion DECIMAL(8,2) NOT NULL CHECK (amount_per_portion >= 0),
  unit               TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g','ml','dl','l','stk')),
  sort_order         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipes_meal_type   ON recipes(meal_type);

-- 4. event_meal_rules auf recipes umstellen --------------------------------
--
-- Die Tabelle ist leer (0 Zeilen), deshalb reicht ein reines ALTER.

ALTER TABLE event_meal_rules ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE event_meal_rules ALTER COLUMN template_id DROP NOT NULL;

-- 5. shopping_list um Zyklus-Herkunft erweitern ----------------------------
--
-- Generierte Positionen werden beim erneuten Sync ersetzt, manuell
-- hinzugefuegte bleiben unangetastet.

ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS is_generated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS cycle_id UUID;

-- 6. day_markers.is_free ---------------------------------------------------
--
-- Vorgezogen aus Phase 4.4: der Zyklus-Planer aus Phase 2 muss freie Tage
-- bei der Boxen-Verteilung ueberspringen und braucht die Spalte deshalb
-- bereits hier.

ALTER TABLE day_markers ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;

-- 7. RLS -------------------------------------------------------------------

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipes','recipe_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', t);
    EXECUTE format('CREATE POLICY allow_all ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- 8. Verifikation ----------------------------------------------------------
--
--   SELECT count(*) FROM meal_templates_backup_20260725;       -- 49
--   SELECT count(*) FROM meal_template_items_backup_20260725;  -- 193
--   SELECT count(*) FROM grosse_menu_items_backup_20260725;    -- 5
--   SELECT count(*) FROM information_schema.tables
--     WHERE table_schema='public' AND table_name IN ('recipes','recipe_items');  -- 2
