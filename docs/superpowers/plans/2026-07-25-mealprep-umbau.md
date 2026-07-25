# Menüplan — Meal-Prep-Umbau + Redesign „Organic" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App von „pro Tag rechnen" auf „pro Portion rechnen" umbauen — Rezepte definieren Mengen pro Portion, Prep-Zyklen multiplizieren sie auf Töpfe und Boxen, Kochliste und Einkaufsliste leiten sich daraus ab — und anschliessend im Stil „Organic" neu gestalten.

**Architecture:** Postgres bleibt Source of Truth; Summen wandern von Hand-Berechnung im Frontend in Trigger. Neues Kernmodell `recipes(amount_per_portion) → prep_batches(portions) → batch_portions(date, slot)`. Bestehende `meals`/`meal_items` bleiben für freie Tage. Alle Supabase-Zugriffe hinter `lib/db/`. Farben ausschliesslich als CSS-Tokens in `globals.css`.

**Tech Stack:** Next.js 16.2.1 (App Router), React 19.2.4, TypeScript strict, Tailwind 4, `@supabase/supabase-js` 2.101. Keine neuen Laufzeit-Abhängigkeiten ausser `next/font/google` (Caprasimo, Figtree).

**Supabase-Projekt:** `kvpexrorkqmxnzqvexga` („Gymapp Cursor", eu-west-1, ACTIVE_HEALTHY). **Achtung: geteilte Datenbank** — dort liegen auch Gym-Tracker- und Trading-Tabellen. Migrationen dürfen ausschliesslich die unten gelisteten Menüplan-Tabellen anfassen.

---

---

## STAND — Sitzung 4: Code vollständig, Migrationen 0005–0008 + 0010 offen

**Alle sieben Phasen sind im Code umgesetzt.** `npm run build` grün ·
`npm run lint` 0 Probleme · `npm test` 8/8.

Angewandt in der Datenbank: `0001` · `0002` · `0003` · `0004`
(Regressionsvergleich bestätigt: historische Tagespläne unverändert).

**Noch einzuspielen, in dieser Reihenfolge:**
`0005_recipes` → `0006_recipes_migrate_data` → `0007_prep_cycles` →
`0008_shopping_aggregate`. Erst wenn die Verifikation von 0006 stimmt:
`0010_drop_legacy_tables`.

Bis 0005/0006 laufen, zeigt `/rezepte` nichts an — die Tabelle existiert noch nicht.

### Was in Sitzung 4 dazukam

- `lib/db/` komplett: `client` (mit `rows`/`row`/`maybeRow`/`ok`), `types`,
  `foods`, `recipes`, `cycles`, `plans`, `shopping`, `analytics`.
  **Kein einziger `supabase.`-Aufruf mehr ausserhalb von `lib/db/`.**
- Migrationen `0005`–`0008` und `0010` geschrieben.
- Neue Seiten: `/rezepte`, `/prep`, `/prep/[cycleId]/kochen`, `/plan`,
  `/auswertung`, `/mehr`. Dashboard neu als „Heute".
- Gelöscht: `/vorlagen`, `/notizen`, `/grosse-menus`, `/kalender`,
  `/tag/[datum]`, `DistributeMenuModal`, `LoadTemplateModal`, `CopyDayModal`,
  `CopyMealModal`, `DayPopup`, `SaveDayTemplateModal`, `FoodSearch`,
  `lib/supabase.ts`.
- Navigation neu belegt: Heute · Plan · Prep · Einkauf · Mehr. Swipe bedeutet
  überall Zeit vorwärts/rückwärts.
- `MealModal` nutzt `RecipePicker` statt eigenem Vorlagen-Picker.
- `Toast` kann Undo (5 s) und nutzt Token-Farben.
- **Kein Hex-Wert mehr** in Seiten oder Komponenten. Einzige Ausnahme
  `lib/export.ts`, dort als `EXPORT_PALETTE` mit Begründung — der Export ist ein
  eigenständiges HTML-Dokument ohne Zugriff auf das Stylesheet.
- README ersetzt: Datenmodell, Kernkonzepte, Migrationsablauf, Design-Tokens,
  Setup, Sicherheitshinweis mit Auth-Vorschlag.

### Noch offen

- Akzeptanzkriterien 1–4 gegen echte Daten (brauchen einen Testzyklus in der DB).
- `supabase gen types` — die Typen in `lib/db/types.ts` sind von Hand
  geschrieben, weil der MCP-Connector auf ein anderes Konto zeigt.

---

## STAND — Sitzung 2026-07-25 (Sitzung 1/2)

**Arbeitsverzeichnis ist nicht committet.** Bewusst so: der Code läuft erst korrekt,
wenn Migration `0002` in der Datenbank angewandt ist. Vorher verschwinden die
41 vormaligen `hauptmahlzeit`-Vorlagen aus `/vorlagen`, weil die Seite jetzt nach
den vier kanonischen Typen gruppiert. **Nicht deployen, bevor 0002 läuft.**

### Erledigt

- Plan geschrieben (dieses Dokument)
- `meal_plans_snapshot_20260725` in der DB angelegt — **68 Zeilen, 119'694.90 kcal,
  13'277.50 g Protein, 1060.483 CHF**. Das ist die Referenz für Akzeptanzkriterium 11.
- Sechs alte `schema*.sql` nach `supabase/legacy/` verschoben, `page.tsx.bak` gelöscht
- `hauptmahlzeit` und `normaliseMealType()` vollständig aus dem Code entfernt;
  neu in `lib/mealTypes.ts`: `isMealTypeKey()`, `mealTypeLabel()`, `mealTypeColor()`
- `lib/calculations.ts` rechnet Carbs und Fett, exportiert `Nutrition`;
  `carbs`/`fat` sind optional, damit bestehende Aufrufer weiterlaufen
- **18 vorbestehende Lint-Fehler behoben** → `npm run lint` meldet 0 Fehler
  (13 Warnungen bleiben, alle in Dateien, die Phase 1 löscht).
  Zwei Muster: `useEffect` vor der Funktionsdeklaration, und synchroner
  `setState` im Effect-Body (`react-hooks/set-state-in-effect`, neu in
  eslint-config-next 16). Gelöst über `void Promise.resolve().then(loader)`
  bzw. Verschieben des `setState` in den Debounce-Callback.
- `npm install` ausgeführt (`node_modules` fehlte komplett), Node v22.21.1

### Sitzung 2 — zusätzlich erledigt (DB-unabhängig)

- **`lib/units.ts`** (Phase 3.1): `toBaseUnit`, `toBaseAmount`, `formatAmount`,
  `roundForShopping`, `unitsForFood`. Formatierungslogik aus
  `app/einkaufsliste/page.tsx` extrahiert und um Rundung und
  Einheiten-Normalisierung erweitert.
- **`tests/units.test.ts`** — 8 Tests, alle grün. Enthält den Rechenkern von
  Akzeptanzkriterium 1 (300 g × 3 = 900 g, 200 g × 3 = 600 g, aggregiert 1.5 kg).
  Neues Skript `npm test` → `node --test --experimental-strip-types tests/*.test.ts`.
  Keine neue Abhängigkeit; `tests/` ist in `tsconfig.json` von `include` ausgenommen.
- **Phase 5.1 fertig:** Caprasimo und Figtree über `next/font/google` in
  `app/layout.tsx` (CSS-Variablen `--font-caprasimo` / `--font-figtree`),
  komplette Token-Palette im `@theme`-Block von `app/globals.css`.
  Verifiziert im generierten CSS: `--color-surface:#fdfaf5`, `--radius-card:20px`,
  Utilities `bg-surface`, `bg-accent-soft`, `rounded-card`, `shadow-card`,
  `text-text-muted` … existieren, 4 woff2 werden selbst gehostet.
- **Phase 5.2 fertig:** `components/ui/` mit `Card.tsx` (+ `CardTitle`, `CardLabel`),
  `Pill.tsx` (+ `MealTypePill`), `Button.tsx` (+ `IconButton`), `StatCard.tsx`
  (+ `StatCardGrid`, horizontale Balken statt Kreisbogen), `SegmentedControl.tsx`,
  `Checkbox.tsx`, `AmountInput.tsx` (Phase 4.1, die Inline-Mengenbearbeitung).

Stand Verifikation: `npm test` 8/8 · `npm run lint` 0 Fehler · `npm run build` grün.

### BLOCKER: Supabase-Connector zeigt auf das falsche Konto

Der Connector ist wieder verbunden, aber unter `kerimtrades.ssg@gmail.com`
(Organisation `qatxjhyolnnficfimwtb`). Sichtbar ist nur `bpggwelpuvbkeudrqoiv` —
das ist die **FX-Terminal-/Trading-Datenbank** (`cot_snapshots`, `price_daily`,
`fred_series`, `ml_experiments`).

Der Menüplan liegt in `kvpexrorkqmxnzqvexga`, Organisation
`qxzrvonguaeewuxwspwg`, Konto `kerim.alur@gmail.com`. Dieses Konto ist nicht
verbunden. Direkter Zugriff quittiert mit
`MCP error -32600: You do not have permission to perform this action`.

**Nichts an der Trading-Datenbank ausführen.** Die Menüplan-Migrationen dort
einzuspielen wäre ein Fehlschuss in ein fremdes Projekt.

Auflösung: Supabase-Connector in den claude.ai-Einstellungen auf
`kerim.alur@gmail.com` umhängen. Alternativ die drei Migrationsdateien von Hand
im Supabase SQL-Editor des Projekts `kvpexrorkqmxnzqvexga` ausführen — sie sind
idempotent und tragen ihren Verifikationsblock am Dateiende.

### Sitzung 3

- **0002 hatte einen Reihenfolgefehler.** Erst Daten, dann Constraints — das
  `UPDATE meal_templates SET meal_type='mittagessen'` lief gegen den noch
  aktiven alten Constraint (`fruehstueck|hauptmahlzeit|snack`) und brach ab mit
  `ERROR 23514`. Korrigiert: **Constraints droppen → Daten migrieren → neue
  Constraints setzen**, plus Sicherheitsnetz-UPDATEs für Werte ausserhalb der
  vier. `notes.meal_type` bleibt nullable, der Constraint erlaubt dort NULL.
- **0001 und 0002 sind angewandt und verifiziert.** `meal_templates` danach:
  fruehstueck 4 · mittagessen 41 · snack 4 = 49. Kein `hauptmahlzeit` mehr.
- **0004_totals_triggers.sql geschrieben:** `recalc_meal_totals` /
  `recalc_plan_totals` plus Trigger auf `meal_items` und `meals`. Kaskade
  meal_items → meals → meal_plans, keine Rekursion. Enthält Backfill der
  Bestandsdaten und den Regressionsvergleich gegen den Snapshot.
- **`recalc()` aus dem Frontend entfernt.** In `app/tag/[datum]/page.tsx`
  rechnen `handleSave`, `deleteMeal`, `duplicateMeal`, `deleteItem` und
  `updateItemAmount` keine Summen mehr — sie schreiben nur noch die Positionen,
  die Trigger ziehen nach. Das waren die fünf fast identischen Codepfade.
- **carbs/fat durchgezogen** durch `MealModal` (Item-Typ, Zutat aus der DB,
  Vorlage anwenden, Direkteingabe, Schnelleingabe) und die Tagesansicht.

### Migrationen

Angewandt: `0001_baseline.sql` · `0002_meal_types_canonical.sql`

Offen, in dieser Reihenfolge: **`0003_macros.sql` vor `0004_totals_triggers.sql`** —
0004 referenziert die Spalten `carbs`/`fat`, die 0003 anlegt.

### Offen

Phase 0.5 (Summen-Trigger) und 0.6 (`lib/db/`) — beide brauchen die DB.
Phase 5.3 (seitenweise Umstellung) ist bewusst noch nicht angefangen: `/vorlagen`,
`/notizen` und `/grosse-menus` verschwinden in Phase 1, `/kalender` und
`/tag/[datum]` in Phase 4.2. Sie jetzt umzustellen wäre Wegwerfarbeit.
Danach Phasen 1–6 laut Plan.

---

## Ist-Zustand (verifiziert am 2026-07-25, nicht aus dem Spec)

Der Spec beschreibt den Stand nicht exakt. Diese Abweichungen sind bindend:

| Spec sagt | Realität | Folge |
|---|---|---|
| ~6.200 Zeilen, 8 Seiten | 8.836 Zeilen, 9 Seiten | zusätzlich `app/grosse-menus/page.tsx` (1.248 Z.) |
| 4 lose SQL-Dateien | 6 (`schema_grosse_menus.sql`, `schema_menu_distribution_log.sql` dazu) | alle nach `supabase/legacy/` |
| `meal_template_items` hat `food_name` | hat **nur** `food_id` | Migration muss auf `foods` joinen; Fallback `'Unbekannt'` |
| `meal_templates.category_id` | `meal_templates.category` **TEXT** | `template_categories` ist leer → Kategorien aus TEXT-Werten erzeugen |
| — | `meals.eaten BOOLEAN` existiert | erhalten, wird „Portion abgehakt" auf freien Tagen |
| — | `day_markers` hat PK `date`, **keine** `id` | `is_free` einfach als Spalte ergänzen |
| — | `foods.unit` CHECK erlaubt nur `g\|ml\|stk` | `dl`/`l` existieren nur als Eingabe-Einheit in `*_items.unit` |
| `notes`/`note_items` migrieren | **0 Zeilen** | Migration läuft, ist aber ein No-Op |
| `settings` gepflegt | **0 Zeilen** | Ziele kommen aus `DEFAULTS` in `lib/settings.ts` |
| `calories_per_100g`/`protein_per_100g` prüfen | nur **1** von 109 `foods`-Zeilen befüllt, nirgends gelesen | ersatzlos droppen |

Echte Zeilenzahlen (`count(*)`, nicht `pg_stat`):
`foods` 109 · `meal_templates` 49 · `meal_template_items` 193 · `meal_plans` 68 · `meals` 242 · `meal_items` 706 · `plan_templates` 7 · `plan_template_days` ~7 · `plan_template_meals` 50 · `plan_template_items` 33 · `shopping_list` 8 · `day_markers` 1 · `grosse_menus` 1 / `grosse_menu_meals` 1 / `grosse_menu_items` 5 · `notes` 0 · `note_items` 0 · `settings` 0 · `event_meal_rules` 0 · `food_categories` 0 · `template_categories` 0

Bestehende CHECK-Constraints auf `meal_type`:

| Tabelle | erlaubte Werte |
|---|---|
| `meals` | `fruehstueck, mittagessen, abendessen, snack` ✅ bereits kanonisch |
| `meal_templates` | `fruehstueck, hauptmahlzeit, snack` ← 41 Zeilen `hauptmahlzeit` |
| `plan_template_meals` | 5 Werte inkl. `hauptmahlzeit` ← 2 Zeilen |
| `notes` | 5 Werte inkl. `hauptmahlzeit` ← 0 Zeilen |
| `event_meal_rules` | 5 Werte inkl. `hauptmahlzeit` ← 0 Zeilen |

## Zwei Entscheidungen des Nutzers (2026-07-25)

1. **`grosse_menus` wird durch Prep-Zyklen abgelöst.** Die 5 Items werden nach `recipes` migriert, dabei `amount_per_portion = amount / num_days`. Seite `app/grosse-menus/`, `DistributeMenuModal.tsx` und der Nav-Eintrag entfallen. Tabellen bleiben als `*_backup_20260725` bestehen.
2. **`recipes.meal_type` ist Vorfilter, keine Sperre.** Alle 41 `hauptmahlzeit`-Vorlagen werden wie im Spec auf `mittagessen` migriert. Jede Rezept-Auswahl (Prep-Planer, Tagesansicht) filtert per Default auf den Slot-Typ, hat aber immer einen Umschalter „alle Rezepte". Kein zusätzliches Schema-Feld.

## Verifikation statt Unit-Tests

Das Projekt hat kein Test-Framework und der Spec verbietet neue Laufzeit-Abhängigkeiten. Verifikation läuft deshalb über drei Kanäle, jeweils **vor** dem Commit einer Phase:

1. `npm run build` und `npm run lint` — beide fehlerfrei (Akzeptanzkriterium 19).
2. **SQL-Assertions** gegen die echte DB — bei jeder Migration mitgeliefert, als `SELECT` mit erwartetem Ergebnis. Bei Datenmigrationen zusätzlich ein Vorher/Nachher-Vergleich.
3. **Nährwert-Regression** (Akzeptanzkriterium 11): vor Phase 0.4 wird `meal_plans` als Snapshot-Tabelle festgehalten und nach jeder Phase gegen den Ist-Stand verglichen.

Reine Rechenfunktionen (`lib/units.ts`, `lib/calculations.ts`) werden zusätzlich mit `node --test --experimental-strip-types` geprüft — das ist im Node-Runtime enthalten und keine neue Abhängigkeit. Testdateien unter `tests/`, per `.eslintignore`/`tsconfig` `exclude` vom Next-Build getrennt.

---

## Datei-Struktur nach dem Umbau

```
supabase/
  migrations/
    0001_baseline.sql                  Ist-Stand aller Menüplan-Tabellen, idempotent
    0002_meal_types_canonical.sql      hauptmahlzeit → mittagessen, CHECKs vereinheitlicht
    0003_macros.sql                    carbs/fat auf foods + allen Item-Tabellen; Legacy-Spalten weg
    0004_totals_triggers.sql           Summen-Trigger meal_items→meals→meal_plans
    0005_recipes.sql                   recipes + recipe_items + Backups
    0006_recipes_migrate_data.sql      meal_templates/notes/grosse_menus → recipes
    0007_prep_cycles.sql               prep_cycles/prep_batches/batch_portions + Trigger-Erweiterung
    0008_shopping_aggregate.sql        RPC cycle_shopping_items()
    0009_day_markers_free.sql          day_markers.is_free
    0010_drop_legacy_tables.sql        alte Tabellen nach *_backup_20260725 (letzte Phase)
  legacy/                              die 6 alten schema*.sql, unverändert
lib/
  db/
    types.ts        generiert via supabase gen types
    client.ts       supabase-Proxy (aus lib/supabase.ts hierher)
    foods.ts        foods + food_categories
    recipes.ts      recipes + recipe_items + template_categories
    cycles.ts       prep_cycles + prep_batches + batch_portions
    plans.ts        meal_plans + meals + meal_items + day_markers
    shopping.ts     shopping_list + cycle_shopping_items RPC
    settings.ts     settings-Tabelle
  calculations.ts   + carbs/fat
  units.ts          NEU: formatAmount, roundForShopping, unit-Normalisierung
  dates.ts          unverändert
  mealTypes.ts      Token-Namen statt Hex
  settings.ts       Token-Namen statt Hex, + default_breakfast_recipe_id
  eventRules.ts     auf recipes umgestellt
  export.ts         + carbs/fat
  useSwipe.ts       unverändert
components/
  ui/  Card.tsx Pill.tsx Button.tsx StatCard.tsx SegmentedControl.tsx Checkbox.tsx
       AmountInput.tsx  (Inline-Bearbeitung, Phase 4.1 — an drei Stellen wiederverwendet)
  Navigation.tsx  Toast.tsx  FoodSearch.tsx  MealModal.tsx  DayPopup.tsx
  RecipePicker.tsx     NEU, ersetzt LoadTemplateModal
  CopyDayModal.tsx  CopyMealModal.tsx  SaveDayTemplateModal.tsx
app/
  page.tsx              „Heute"
  plan/page.tsx         Kalender + Woche + Tagesdetail (ersetzt kalender/ + tag/[datum]/)
  prep/page.tsx         Zyklus-Liste + Planer
  prep/[cycleId]/kochen/page.tsx
  einkaufsliste/page.tsx
  rezepte/page.tsx      ersetzt vorlagen/ + notizen/
  datenbank/page.tsx
  auswertung/page.tsx   NEU
  einstellungen/page.tsx
  mehr/page.tsx         NEU, Sammelseite für Nav-Slot 5
```

Entfallen: `app/kalender/`, `app/tag/[datum]/`, `app/vorlagen/`, `app/notizen/`, `app/grosse-menus/`, `components/DistributeMenuModal.tsx`, `components/LoadTemplateModal.tsx`, `app/kalender/page.tsx.bak`.

---

# Phase 0 — Fundament

### Task 0.1: Snapshot für die Nährwert-Regression

**Files:** nur DB.

- [ ] **Step 1: Snapshot-Tabelle anlegen**

Via `apply_migration`, Name `0000_regression_snapshot`:

```sql
CREATE TABLE IF NOT EXISTS meal_plans_snapshot_20260725 AS
SELECT id, date, kcal_total, protein_total, cost_total FROM meal_plans;
```

- [ ] **Step 2: Prüfen, dass 68 Zeilen drin sind**

```sql
SELECT count(*) FROM meal_plans_snapshot_20260725;
```
Erwartet: `68`.

- [ ] **Step 3: Referenz-Abfrage festhalten**

Diese Abfrage muss nach *jeder* Phase 0 Zeilen liefern:

```sql
SELECT s.date, s.kcal_total AS alt_kcal, p.kcal_total AS neu_kcal,
       s.protein_total AS alt_prot, p.protein_total AS neu_prot,
       s.cost_total AS alt_kosten, p.cost_total AS neu_kosten
FROM meal_plans_snapshot_20260725 s
JOIN meal_plans p ON p.id = s.id
WHERE round(s.kcal_total,1)    IS DISTINCT FROM round(p.kcal_total,1)
   OR round(s.protein_total,1) IS DISTINCT FROM round(p.protein_total,1)
   OR round(s.cost_total,3)    IS DISTINCT FROM round(p.cost_total,3);
```

---

### Task 0.2: Migrations-Verzeichnis + Baseline

**Files:**
- Create: `supabase/migrations/0001_baseline.sql`
- Move: `schema.sql`, `schema_update.sql`, `schema_fix_meal_types.sql`, `schema_v3_mittagessen_abendessen.sql`, `schema_grosse_menus.sql`, `schema_menu_distribution_log.sql` → `supabase/legacy/`

- [ ] **Step 1: Alte Dateien verschieben (nicht löschen)**

```bash
cd "c:/Projekte/Claude Cowork/Men-plan/Men-plan"
mkdir -p supabase/legacy supabase/migrations
git mv schema.sql schema_update.sql schema_fix_meal_types.sql \
       schema_v3_mittagessen_abendessen.sql schema_grosse_menus.sql \
       schema_menu_distribution_log.sql supabase/legacy/
git rm app/kalender/page.tsx.bak
```

- [ ] **Step 2: `0001_baseline.sql` schreiben**

Bildet den **tatsächlichen** Stand ab (Spalten wie oben verifiziert), komplett mit `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, RLS `allow_all` für `anon`. Enthält **nicht** das rückwärts migrierende `UPDATE meal_templates SET meal_type = 'hauptmahlzeit' …` aus `schema.sql` Abschnitt 6. Tabellen: `foods`, `food_categories`, `template_categories`, `meal_plans`, `meals`, `meal_items`, `meal_templates`, `meal_template_items`, `plan_templates`, `plan_template_days`, `plan_template_meals`, `plan_template_items`, `notes`, `note_items`, `shopping_list`, `settings`, `day_markers`, `event_meal_rules`, `grosse_menus`, `grosse_menu_meals`, `grosse_menu_items`, `menu_distribution_log`.

- [ ] **Step 3: Idempotenz gegen die echte DB prüfen**

Baseline zweimal per `execute_sql` ausführen. Erwartet: beide Male ohne Fehler, danach

```sql
SELECT count(*) FROM foods;           -- 109
SELECT count(*) FROM meal_items;      -- 706
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore(db): Migrations-Verzeichnis + Baseline aus Ist-Stand"
```

---

### Task 0.3: Meal-Types kanonisch

**Files:**
- Create: `supabase/migrations/0002_meal_types_canonical.sql`
- Modify: `lib/mealTypes.ts` (`normaliseMealType` und Legacy-Einträge entfernen)
- Modify: alle Aufrufer von `normaliseMealType`

- [ ] **Step 1: Aufrufer finden**

```bash
grep -rn "normaliseMealType\|hauptmahlzeit" app components lib
```

- [ ] **Step 2: Migration schreiben und anwenden**

```sql
UPDATE meal_templates      SET meal_type='mittagessen' WHERE meal_type='hauptmahlzeit';
UPDATE plan_template_meals SET meal_type='mittagessen' WHERE meal_type='hauptmahlzeit';
UPDATE notes               SET meal_type='mittagessen' WHERE meal_type='hauptmahlzeit';
UPDATE event_meal_rules    SET meal_type='mittagessen' WHERE meal_type='hauptmahlzeit';

ALTER TABLE meal_templates      DROP CONSTRAINT IF EXISTS meal_templates_meal_type_check;
ALTER TABLE plan_template_meals DROP CONSTRAINT IF EXISTS plan_template_meals_meal_type_check;
ALTER TABLE notes               DROP CONSTRAINT IF EXISTS notes_meal_type_check;
ALTER TABLE event_meal_rules    DROP CONSTRAINT IF EXISTS event_meal_rules_meal_type_check;
ALTER TABLE meals               DROP CONSTRAINT IF EXISTS meals_meal_type_check;

ALTER TABLE meal_templates      ADD CONSTRAINT meal_templates_meal_type_check
  CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack'));
-- identisch für plan_template_meals, notes, event_meal_rules, meals
```

- [ ] **Step 3: Verifizieren, dass `hauptmahlzeit` nirgends mehr existiert**

```sql
SELECT 'meal_templates' t, count(*) FROM meal_templates WHERE meal_type='hauptmahlzeit'
UNION ALL SELECT 'plan_template_meals', count(*) FROM plan_template_meals WHERE meal_type='hauptmahlzeit'
UNION ALL SELECT 'notes', count(*) FROM notes WHERE meal_type='hauptmahlzeit'
UNION ALL SELECT 'event_meal_rules', count(*) FROM event_meal_rules WHERE meal_type='hauptmahlzeit'
UNION ALL SELECT 'meals', count(*) FROM meals WHERE meal_type='hauptmahlzeit';
```
Erwartet: fünf Zeilen, alle `0`.

- [ ] **Step 4: `lib/mealTypes.ts` bereinigen**

`normaliseMealType()` löschen. Aus `MEAL_TYPE_LABELS` und `MEAL_TYPE_COLORS` die `hauptmahlzeit`-Einträge entfernen. Beide `Record<string, …>` auf `Record<MealTypeKey, …>` verengen.

- [ ] **Step 5: Aufrufer anpassen**

In `app/tag/[datum]/page.tsx`, `app/vorlagen/page.tsx`, `app/notizen/page.tsx`, `components/MealModal.tsx`, `components/LoadTemplateModal.tsx`: jeden `normaliseMealType(x)`-Aufruf durch `x as MealTypeKey` ersetzen und die Rückkonvertierung in `handleSave()` (`meal_type === 'mittagessen' || 'abendessen' ? 'hauptmahlzeit' : …`) ersatzlos streichen.

- [ ] **Step 6: Build + Lint**

```bash
npm run lint && npm run build
```
Erwartet: beide ohne Fehler. Danach `grep -rn "hauptmahlzeit" app components lib` → keine Treffer.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: meal_type kanonisch auf 4 Werte, hauptmahlzeit entfernt"
```

---

### Task 0.4: Makronährstoffe

**Files:**
- Create: `supabase/migrations/0003_macros.sql`
- Modify: `lib/calculations.ts`, `lib/export.ts`, `app/datenbank/page.tsx`, `components/MealModal.tsx`, `components/FoodSearch.tsx`

- [x] **Step 1: Prüfen, ob die vermeintlichen Legacy-Spalten gelesen werden — ERLEDIGT, Ergebnis negativ**

```bash
grep -rn "calories_per_100g\|protein_per_100g" app components lib supabase
```

**Ergebnis: sie WERDEN gelesen.** Der Spec vermutet Altlasten und verlangt
„prüfen, und *falls nicht* gelesen, entfernen" — die Bedingung trifft nicht zu.
Bei Lebensmitteln mit `unit='stk'` halten die Spalten die Per-100g-Werte, damit
dasselbe Lebensmittel wahlweise in Stück oder Gramm erfasst werden kann:
`components/MealModal.tsx` (`effectiveFood()`), `components/FoodSearch.tsx`,
`app/datenbank/page.tsx`. **Die Spalten bleiben erhalten** und werden in der
README als Feature dokumentiert, nicht als Altlast.

- [x] **Step 2: Migration — ERLEDIGT, siehe `supabase/migrations/0003_macros.sql`**

```sql
ALTER TABLE foods ADD COLUMN IF NOT EXISTS carbs_per_100 DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS fat_per_100   DECIMAL(8,2) NOT NULL DEFAULT 0;
-- calories_per_100g / protein_per_100g werden bewusst NICHT gedroppt (siehe Step 1)

ALTER TABLE meal_items         ADD COLUMN IF NOT EXISTS carbs DECIMAL(8,2) NOT NULL DEFAULT 0,
                               ADD COLUMN IF NOT EXISTS fat   DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE plan_template_items ADD COLUMN IF NOT EXISTS carbs DECIMAL(8,2) NOT NULL DEFAULT 0,
                                ADD COLUMN IF NOT EXISTS fat   DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE grosse_menu_items   ADD COLUMN IF NOT EXISTS carbs DECIMAL(8,2) NOT NULL DEFAULT 0,
                                ADD COLUMN IF NOT EXISTS fat   DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE meals      ADD COLUMN IF NOT EXISTS carbs_total DECIMAL(8,2) NOT NULL DEFAULT 0,
                       ADD COLUMN IF NOT EXISTS fat_total   DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS carbs_total DECIMAL(8,2) NOT NULL DEFAULT 0,
                       ADD COLUMN IF NOT EXISTS fat_total   DECIMAL(8,2) NOT NULL DEFAULT 0;
```

- [ ] **Step 3: `lib/calculations.ts` erweitern**

```ts
interface FoodLike {
  calories_per_100: number
  protein_per_100:  number
  carbs_per_100:    number
  fat_per_100:      number
  cost_per_100:     number
}

export function calcNutrition(food: FoodLike, amount: number | string, unit: string) {
  const f = toFactor(amount, unit)
  return {
    kcal:    Math.round(food.calories_per_100 * f * 10) / 10,
    protein: Math.round(food.protein_per_100  * f * 10) / 10,
    carbs:   Math.round(food.carbs_per_100    * f * 10) / 10,
    fat:     Math.round(food.fat_per_100      * f * 10) / 10,
    cost:    Math.round(food.cost_per_100     * f * 1000) / 1000,
  }
}

interface Summable { kcal: number; protein: number; carbs: number; fat: number; cost: number }

export function sumItems(items: Summable[]) {
  return items.reduce((a, i) => ({
    kcal:    Math.round((a.kcal    + i.kcal)    * 10)   / 10,
    protein: Math.round((a.protein + i.protein) * 10)   / 10,
    carbs:   Math.round((a.carbs   + i.carbs)   * 10)   / 10,
    fat:     Math.round((a.fat     + i.fat)     * 10)   / 10,
    cost:    Math.round((a.cost    + i.cost)    * 1000) / 1000,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 })
}
```

`FoodLike` muss `carbs_per_100`/`fat_per_100` optional-sicher behandeln: Aufrufer, die Objekte ohne diese Felder übergeben, würden `NaN` liefern. Deshalb in `calcNutrition` mit `?? 0` absichern.

- [ ] **Step 4: Datenbank-Seite um zwei Eingabefelder erweitern**

In `app/datenbank/page.tsx` neben kcal und Protein je ein Feld für Carbs und Fett, `inputMode="decimal"`. Der Listen-Import muss die beiden neuen Spalten optional akzeptieren.

- [ ] **Step 5: Anzeige nur bei > 0**

Überall dort, wo kcal/Protein angezeigt werden, Carbs und Fett nur rendern, wenn der Wert `> 0` ist.

- [ ] **Step 6: Build + Lint + Regression**

```bash
npm run lint && npm run build
```
Plus die Referenz-Abfrage aus Task 0.1 → 0 Zeilen.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(db): Carbs und Fett auf foods und allen Item-Tabellen"
```

---

### Task 0.5: Summen-Trigger

**Files:**
- Create: `supabase/migrations/0004_totals_triggers.sql`
- Modify: `app/tag/[datum]/page.tsx` (`recalc()` und die fünf Neuberechnungs-Pfade entfernen)

- [ ] **Step 1: Trigger-Funktionen**

```sql
CREATE OR REPLACE FUNCTION recalc_meal_totals(p_meal_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE meals m SET
    kcal_total    = COALESCE(s.kcal, 0),
    protein_total = COALESCE(s.protein, 0),
    carbs_total   = COALESCE(s.carbs, 0),
    fat_total     = COALESCE(s.fat, 0),
    cost_total    = COALESCE(s.cost, 0)
  FROM (SELECT SUM(kcal) kcal, SUM(protein) protein, SUM(carbs) carbs,
               SUM(fat) fat, SUM(cost) cost
        FROM meal_items WHERE meal_id = p_meal_id) s
  WHERE m.id = p_meal_id;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalc_plan_totals(p_plan_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE meal_plans p SET
    kcal_total    = COALESCE(s.kcal, 0),
    protein_total = COALESCE(s.protein, 0),
    carbs_total   = COALESCE(s.carbs, 0),
    fat_total     = COALESCE(s.fat, 0),
    cost_total    = COALESCE(s.cost, 0)
  FROM (SELECT SUM(kcal_total) kcal, SUM(protein_total) protein, SUM(carbs_total) carbs,
               SUM(fat_total) fat, SUM(cost_total) cost
        FROM meals WHERE plan_id = p_plan_id) s
  WHERE p.id = p_plan_id;
END; $$ LANGUAGE plpgsql;
```

Dazu je ein `AFTER INSERT OR UPDATE OR DELETE`-Trigger auf `meal_items` (ruft `recalc_meal_totals` für `NEW.meal_id` und, falls abweichend, `OLD.meal_id`) und auf `meals` (ruft `recalc_plan_totals`, plus bei `UPDATE OF plan_id` beide Pläne).

- [ ] **Step 2: Bestandsdaten einmalig neu rechnen und gegen den Snapshot prüfen**

```sql
SELECT recalc_meal_totals(id) FROM meals;
SELECT recalc_plan_totals(id) FROM meal_plans;
```
Danach die Referenz-Abfrage aus Task 0.1. **Erwartet: 0 Zeilen.** Liefert sie Zeilen, waren die Frontend-Summen falsch — dann Abweichung dokumentieren, bevor irgendetwas anderes passiert.

- [ ] **Step 3: Frontend-Neuberechnung entfernen**

In `app/tag/[datum]/page.tsx`: `recalc()` löschen; in `handleSave`, `deleteItem`, `updateItemAmount`, `deleteMeal`, `duplicateMeal` jeweils den Block, der Summen von Hand aufaddiert und per `update` schreibt, streichen. `loadData()` bleibt.

- [ ] **Step 4: Build + Lint + Regression** (wie oben)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(db): Summen per Trigger statt im Frontend"
```

---

### Task 0.6: `lib/db/` Datenzugriffsschicht

**Files:**
- Create: `lib/db/types.ts` (generiert), `lib/db/client.ts`, `lib/db/foods.ts`, `lib/db/plans.ts`, `lib/db/shopping.ts`, `lib/db/settings.ts`
- Delete: `lib/supabase.ts` (Inhalt wandert nach `lib/db/client.ts`, Re-Export für Übergangszeit)

- [ ] **Step 1: Typen generieren**

Via MCP `generate_typescript_types` für `kvpexrorkqmxnzqvexga`, Ergebnis nach `lib/db/types.ts`. Der Datei einen Kopfkommentar geben: „generiert — nicht von Hand ändern".

- [ ] **Step 2: `client.ts`**

Inhalt von `lib/supabase.ts` übernehmen, aber typisiert: `createClient<Database>(…)`.

- [ ] **Step 3: Module schreiben**

Pro Modul typisierte Funktionen, die genau eine Verantwortung haben, z. B. in `plans.ts`:
`getPlanByDate(date)`, `ensurePlan(date)`, `getMealsForDate(date)`, `addMeal(...)`, `deleteMeal(id)`, `moveMeal(id, planId, mealType)`, `addMealItem(...)`, `updateMealItemAmount(id, amount, unit)`, `deleteMealItem(id)`, `getDayMarker(date)`, `setDayMarker(...)`.

- [ ] **Step 4: Seiten umstellen**

Jede rohe `supabase.from(...)`-Kette in `app/` und `components/` durch einen Aufruf aus `lib/db/` ersetzen. Kontrolle:

```bash
grep -rn "supabase.from(" app components | grep -v "^lib/db"
```
Erwartet: keine Treffer.

- [ ] **Step 5: Build + Lint + Commit**

```bash
npm run lint && npm run build
git add -A && git commit -m "refactor: zentrale Datenzugriffsschicht in lib/db"
```

---

# Phase 1 — Rezepte

### Task 1.1: Schema `recipes` / `recipe_items`

**Files:** Create `supabase/migrations/0005_recipes.sql`

- [ ] **Step 1: Backups anlegen** (Anforderung „vor Phase 1")

```sql
CREATE TABLE IF NOT EXISTS meal_templates_backup_20260725      AS SELECT * FROM meal_templates;
CREATE TABLE IF NOT EXISTS meal_template_items_backup_20260725 AS SELECT * FROM meal_template_items;
CREATE TABLE IF NOT EXISTS notes_backup_20260725               AS SELECT * FROM notes;
CREATE TABLE IF NOT EXISTS note_items_backup_20260725          AS SELECT * FROM note_items;
CREATE TABLE IF NOT EXISTS grosse_menus_backup_20260725        AS SELECT * FROM grosse_menus;
CREATE TABLE IF NOT EXISTS grosse_menu_meals_backup_20260725   AS SELECT * FROM grosse_menu_meals;
CREATE TABLE IF NOT EXISTS grosse_menu_items_backup_20260725   AS SELECT * FROM grosse_menu_items;
```

- [ ] **Step 2: Tabellen anlegen**

```sql
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

CREATE TABLE IF NOT EXISTS recipe_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id          UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_id            UUID REFERENCES foods(id) ON DELETE SET NULL,
  food_name          TEXT NOT NULL,
  amount_per_portion DECIMAL(8,2) NOT NULL CHECK (amount_per_portion >= 0),
  unit               TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g','ml','dl','l','stk')),
  sort_order         INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
```
Plus RLS `allow_all` für `anon` auf beiden Tabellen (gleiche Policy wie überall).

- [ ] **Step 3: Verifizieren**

```sql
SELECT count(*) FROM meal_templates_backup_20260725;  -- 49
SELECT count(*) FROM information_schema.tables WHERE table_name IN ('recipes','recipe_items'); -- 2
```

---

### Task 1.2: Datenmigration nach `recipes`

**Files:** Create `supabase/migrations/0006_recipes_migrate_data.sql`

Reihenfolge: Kategorien → `meal_templates` → `notes` → `grosse_menus`. Namenskollisionen mit Suffix ` (2)`, ` (3)` … auflösen.

- [ ] **Step 1: `template_categories` aus den TEXT-Werten füllen**

```sql
INSERT INTO template_categories (name)
SELECT DISTINCT category FROM meal_templates
WHERE category IS NOT NULL AND category <> ''
  AND NOT EXISTS (SELECT 1 FROM template_categories tc WHERE tc.name = meal_templates.category);
```
Erwartet danach 3 Zeilen: `Aufwendig`, `Bei der Arbeit`, `Praktisch`.

- [ ] **Step 2: `meal_templates` → `recipes`**

Idempotenz über eine Hilfsspalte: `ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source_ref TEXT UNIQUE;` mit Werten `'mt:'||id`, `'note:'||id`, `'gm:'||menu_meal_id`. Nur einfügen, wenn `source_ref` noch nicht existiert.

```sql
INSERT INTO recipes (name, meal_type, category_id, status, freetext, default_portions, source_ref)
SELECT t.name, t.meal_type,
       (SELECT id FROM template_categories tc WHERE tc.name = t.category),
       'bereit', '', 3, 'mt:'||t.id
FROM meal_templates t
WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE r.source_ref = 'mt:'||t.id);
```

`meal_template_items` hat **kein** `food_name` — join auf `foods`:

```sql
INSERT INTO recipe_items (recipe_id, food_id, food_name, amount_per_portion, unit, sort_order)
SELECT r.id, i.food_id, COALESCE(f.name, 'Unbekannt'), i.amount, i.unit,
       row_number() OVER (PARTITION BY i.template_id ORDER BY i.created_at)
FROM meal_template_items i
JOIN recipes r ON r.source_ref = 'mt:'||i.template_id
LEFT JOIN foods f ON f.id = i.food_id
WHERE NOT EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.recipe_id = r.id);
```

- [ ] **Step 3: `notes` → `recipes`** (0 Zeilen, muss trotzdem korrekt sein)

Analog, mit `status`/`freetext` aus `notes`, `meal_type` per `COALESCE(meal_type,'mittagessen')`, `name = notes.title`, `source_ref = 'note:'||id`. Items aus `note_items` mit `amount_per_portion = COALESCE(amount, 0)`, `unit = COALESCE(unit,'g')`, `sort_order = note_items.sort_order`.

- [ ] **Step 4: `grosse_menus` → `recipes`** (Nutzer-Entscheidung 1)

Mengen sind Totale für `num_days` Tage → durch `num_days` teilen:

```sql
INSERT INTO recipes (name, meal_type, status, freetext, default_portions, source_ref)
SELECT gm.name || ' — ' || g.name, gm.meal_type, 'bereit', '',
       GREATEST(g.num_days, 1), 'gm:'||gm.id
FROM grosse_menu_meals gm
JOIN grosse_menus g ON g.id = gm.menu_id
WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE r.source_ref = 'gm:'||gm.id);

INSERT INTO recipe_items (recipe_id, food_id, food_name, amount_per_portion, unit, sort_order)
SELECT r.id, i.food_id, i.food_name,
       ROUND(i.amount / GREATEST(g.num_days,1), 2), i.unit,
       row_number() OVER (PARTITION BY i.menu_meal_id ORDER BY i.created_at)
FROM grosse_menu_items i
JOIN grosse_menu_meals gm ON gm.id = i.menu_meal_id
JOIN grosse_menus g       ON g.id  = gm.menu_id
JOIN recipes r            ON r.source_ref = 'gm:'||gm.id
WHERE NOT EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.recipe_id = r.id);
```

- [ ] **Step 5: Namenskollisionen auflösen**

```sql
WITH d AS (
  SELECT id, name, row_number() OVER (PARTITION BY lower(name) ORDER BY created_at, id) rn
  FROM recipes
)
UPDATE recipes r SET name = r.name || ' (' || d.rn || ')'
FROM d WHERE d.id = r.id AND d.rn > 1;
```

- [ ] **Step 6: Verifizieren**

```sql
SELECT (SELECT count(*) FROM meal_templates)      AS mt,
       (SELECT count(*) FROM recipes WHERE source_ref LIKE 'mt:%')   AS r_mt,
       (SELECT count(*) FROM meal_template_items) AS mti,
       (SELECT count(*) FROM recipe_items ri JOIN recipes r ON r.id=ri.recipe_id
        WHERE r.source_ref LIKE 'mt:%')           AS r_mti,
       (SELECT count(*) FROM grosse_menu_items)   AS gmi,
       (SELECT count(*) FROM recipe_items ri JOIN recipes r ON r.id=ri.recipe_id
        WHERE r.source_ref LIKE 'gm:%')           AS r_gmi,
       (SELECT count(*) FROM (SELECT lower(name) FROM recipes GROUP BY 1 HAVING count(*)>1) x) AS dupes;
```
Erwartet: `mt = r_mt = 49`, `mti = r_mti = 193`, `gmi = r_gmi = 5`, `dupes = 0`.

Migration zweimal ausführen, Zahlen müssen identisch bleiben (Idempotenz).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(db): recipes/recipe_items + Migration aus Vorlagen, Notizen, grossen Menüs"
```

---

### Task 1.3: `app/rezepte/`

**Files:**
- Create: `app/rezepte/page.tsx`, `lib/db/recipes.ts`, `components/RecipePicker.tsx`
- Delete: `app/vorlagen/page.tsx`, `app/notizen/page.tsx`, `components/LoadTemplateModal.tsx`
- Modify: `components/Navigation.tsx`, `lib/eventRules.ts`

- [ ] **Step 1: `lib/db/recipes.ts`**

`listRecipes(filter)`, `getRecipe(id)`, `createRecipe(...)`, `updateRecipe(id, patch)`, `deleteRecipe(id)`, `duplicateRecipe(id)`, `addRecipeItem(...)`, `updateRecipeItemAmount(id, amount, unit)`, `deleteRecipeItem(id)`, `recipeNutritionPerPortion(items, foods)`.

- [ ] **Step 2: Seite bauen**

Liste mit Filterleiste (Mahlzeit-Typ, Kategorie, Status, „nur Favoriten") + Volltextsuche über `name`. Detailansicht: Zutaten mit Menge **pro Portion**, Live-Summe pro Portion für kcal/Protein/Carbs/Fett/Kosten (Carbs und Fett nur bei > 0), Freitext-Feld, Duplizieren, Favoriten-Stern, `default_portions`.

- [ ] **Step 3: `components/RecipePicker.tsx`**

Ersetzt `LoadTemplateModal`. Props: `mealType?: MealTypeKey`, `onPick(recipe)`. **Wichtig (Nutzer-Entscheidung 2):** filtert per Default auf `mealType`, hat aber immer einen Umschalter „alle Rezepte", der den Filter aufhebt. Favoriten und zuletzt verwendete Rezepte stehen zuoberst.

- [ ] **Step 4: `eventRules` umstellen**

`event_meal_rules.template_id` → `recipe_id` (Migration in `0006`; Tabelle ist leer, also reines `ALTER`). `lib/eventRules.ts` liest jetzt `recipes`.

- [ ] **Step 5: Alte Seiten entfernen + Navigation**

`app/vorlagen/`, `app/notizen/`, `app/grosse-menus/`, `components/DistributeMenuModal.tsx`, `components/LoadTemplateModal.tsx` löschen. `Navigation.tsx` provisorisch auf die neue Route zeigen lassen (endgültige Belegung in Phase 4.2).

- [ ] **Step 6: Build + Lint + Commit**

```bash
npm run lint && npm run build
git add -A && git commit -m "feat: /rezepte ersetzt /vorlagen, /notizen und /grosse-menus"
```

---

# Phase 2 — Prep-Zyklen

### Task 2.1: Schema

**Files:** Create `supabase/migrations/0007_prep_cycles.sql`

- [ ] **Step 1: Tabellen** — exakt nach Spec 2.1, plus:

```sql
CREATE TABLE IF NOT EXISTS prep_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  cook_date DATE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'geplant'
         CHECK (status IN ('geplant','eingekauft','gekocht','erledigt')),
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS prep_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES prep_cycles(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack')),
  portions INT NOT NULL CHECK (portions BETWEEN 1 AND 14),
  kcal_per_portion    DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein_per_portion DECIMAL(8,2) NOT NULL DEFAULT 0,
  carbs_per_portion   DECIMAL(8,2) NOT NULL DEFAULT 0,
  fat_per_portion     DECIMAL(8,2) NOT NULL DEFAULT 0,
  cost_per_portion    DECIMAL(8,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_portions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES prep_batches(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('fruehstueck','mittagessen','abendessen','snack')),
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (batch_id, date, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_batch_portions_date ON batch_portions(date);
```
RLS `allow_all` auf allen dreien.

- [ ] **Step 2: Tagessummen-Trigger auf beide Quellen erweitern**

`recalc_plan_totals` muss `meals` **und** `batch_portions` addieren:

```sql
CREATE OR REPLACE FUNCTION recalc_plan_totals_for_date(p_date DATE) RETURNS VOID AS $$
DECLARE v_plan UUID;
BEGIN
  SELECT id INTO v_plan FROM meal_plans WHERE date = p_date;
  IF v_plan IS NULL THEN RETURN; END IF;
  UPDATE meal_plans p SET
    kcal_total    = COALESCE(m.kcal,0)    + COALESCE(b.kcal,0),
    protein_total = COALESCE(m.protein,0) + COALESCE(b.protein,0),
    carbs_total   = COALESCE(m.carbs,0)   + COALESCE(b.carbs,0),
    fat_total     = COALESCE(m.fat,0)     + COALESCE(b.fat,0),
    cost_total    = COALESCE(m.cost,0)    + COALESCE(b.cost,0)
  FROM (SELECT SUM(kcal_total) kcal, SUM(protein_total) protein, SUM(carbs_total) carbs,
               SUM(fat_total) fat, SUM(cost_total) cost
        FROM meals WHERE plan_id = v_plan) m,
       (SELECT SUM(pb.kcal_per_portion) kcal, SUM(pb.protein_per_portion) protein,
               SUM(pb.carbs_per_portion) carbs, SUM(pb.fat_per_portion) fat,
               SUM(pb.cost_per_portion) cost
        FROM batch_portions bp JOIN prep_batches pb ON pb.id = bp.batch_id
        WHERE bp.date = p_date) b
  WHERE p.id = v_plan;
END; $$ LANGUAGE plpgsql;
```

Trigger auf `batch_portions` (`INSERT`/`UPDATE`/`DELETE` → `NEW.date` und `OLD.date`) und auf `prep_batches` (`UPDATE` der Werte pro Portion → alle betroffenen Daten). `recalc_plan_totals(plan_id)` wird zum dünnen Wrapper, der das Datum nachschlägt.

- [ ] **Step 3: Verifizieren, dass Bestand unverändert bleibt**

Nach dem Anwenden: `SELECT recalc_plan_totals_for_date(date) FROM meal_plans;` dann die Referenz-Abfrage aus Task 0.1 → **0 Zeilen** (es gibt noch keine `batch_portions`, also darf sich nichts ändern).

- [ ] **Step 4: Batch-Werte bei Rezeptänderung nachziehen**

Trigger auf `recipe_items`: bei `INSERT`/`UPDATE`/`DELETE` alle `prep_batches` neu berechnen, deren Zyklus `status = 'geplant'` hat. Ab `eingekauft` bleiben die Werte eingefroren.

---

### Task 2.2: `app/prep/` Zyklus-Planer

**Files:** Create `app/prep/page.tsx`, `lib/db/cycles.ts`

- [ ] **Step 1: `lib/db/cycles.ts`**

`listCycles()`, `getCycle(id)`, `createCycle(input)` (legt Zyklus, Batches, Boxen und fehlende `meal_plans` in einem Rutsch an), `updateBatchPortions(batchId, portions)`, `movePortion(portionId, date, mealType)`, `setCycleStatus(id, status)`, `deleteCycle(id)`.

`updateBatchPortions` muss Boxen angleichen: zu viele → jüngste löschen, zu wenige → auf die noch freien Tage/Slots des Zyklus verteilen.

- [ ] **Step 2: Planer-UI** — ein Screen, sechs Abschnitte nach Spec 2.2

Kochtag (Datepicker, Default heute) · Anzahl Tage (Segmented Control 2/3) · Rezeptwahl über `RecipePicker` je Slot · Portionen pro Batch (`AmountInput`, ganzzahlig) · Boxen-Raster Tage × Slots mit Tap-zum-Verschieben · Live-Vorschau pro Tag gegen die Tagesziele.

Als frei markierte Tage (`day_markers.is_free`, Phase 4.4) werden bei der Verteilung übersprungen — bis Phase 4 ist das ein `false`-Default, der Code muss die Spalte aber schon berücksichtigen. **Deshalb `0009_day_markers_free.sql` auf Phase 2 vorziehen.**

- [ ] **Step 3: Akzeptanzkriterium 1 gegen die DB prüfen**

Testzyklus anlegen: Rezept A (Mittag, 300 g Kartoffeln/Portion), Rezept B (Abend, 200 g/Portion), je 3 Portionen.

```sql
SELECT r.name, ri.food_name, ri.amount_per_portion, pb.portions,
       ri.amount_per_portion * pb.portions AS total
FROM prep_batches pb
JOIN recipes r ON r.id = pb.recipe_id
JOIN recipe_items ri ON ri.recipe_id = r.id
WHERE pb.cycle_id = '<test-id>' AND ri.food_name ILIKE '%kartoffel%';
```
Erwartet: 900 und 600. Aggregiert 1500. Testzyklus danach löschen.

- [ ] **Step 4: Build + Lint + Commit**

---

# Phase 3 — Kochliste und Einkaufsliste

### Task 3.1: `lib/units.ts`

**Files:** Create `lib/units.ts`, `tests/units.test.ts`; Modify `app/einkaufsliste/page.tsx`

- [ ] **Step 1: Formatierungslogik aus `app/einkaufsliste/page.tsx` extrahieren**

```ts
export function formatAmount(amount: number, unit: string): string
// 900,'g' → '900 g' · 1500,'g' → '1.5 kg' · 600,'ml' → '6 dl' · 3,'stk' → '3 Stk.'

export function roundForShopping(amount: number, unit: string): number
// g/ml → auf 100 aufrunden · stk → auf ganze Zahl aufrunden · sonst unverändert

export function toBaseUnit(amount: number, unit: string): { amount: number; unit: string }
// dl/l → ml, damit über Einheiten hinweg aggregiert werden kann
```

- [ ] **Step 2: Tests**

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmount, roundForShopping, toBaseUnit } from '../lib/units.ts'

test('formatAmount', () => {
  assert.equal(formatAmount(900, 'g'), '900 g')
  assert.equal(formatAmount(1500, 'g'), '1.5 kg')
  assert.equal(formatAmount(600, 'ml'), '6 dl')
  assert.equal(formatAmount(3, 'stk'), '3 Stk.')
})

test('roundForShopping rundet auf', () => {
  assert.equal(roundForShopping(1450, 'g'), 1500)
  assert.equal(roundForShopping(2.3, 'stk'), 3)
})

test('toBaseUnit normalisiert Flüssigkeiten', () => {
  assert.deepEqual(toBaseUnit(6, 'dl'), { amount: 600, unit: 'ml' })
  assert.deepEqual(toBaseUnit(1.5, 'l'), { amount: 1500, unit: 'ml' })
})
```

Ausführen: `node --test --experimental-strip-types tests/` — erwartet: alle grün.

- [ ] **Step 3: Alte Formatierung in der Einkaufsliste durch `lib/units.ts` ersetzen. Build + Lint + Commit.**

---

### Task 3.2: Kochliste `app/prep/[cycleId]/kochen/`

- [ ] **Step 1: Seite bauen** — ein Block pro Batch, Zutat mit `amount_per_portion × portions` via `formatAmount`, runde Checkbox mit `localStorage`-Zustand (Key `kochliste:<cycleId>`), Box-Aufteilung („3 Boxen à 300 g Kartoffeln, …"), Kopfzeile mit Gesamtkosten und Kosten pro Portion, Button „als gekocht markieren".

- [ ] **Step 2: Wake Lock mit Feature-Detection**

```ts
useEffect(() => {
  let lock: WakeLockSentinel | null = null
  const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinel> } }
  nav.wakeLock?.request('screen').then(l => { lock = l }).catch(() => {})
  return () => { lock?.release().catch(() => {}) }
}, [])
```
Ohne `any`; bei fehlender API passiert stillschweigend nichts.

- [ ] **Step 3: Build + Lint + Commit**

---

### Task 3.3: Einkaufsliste-Aggregation

**Files:** Create `supabase/migrations/0008_shopping_aggregate.sql`; Modify `app/einkaufsliste/page.tsx`, `lib/db/shopping.ts`

- [ ] **Step 1: RPC statt vier Queries**

```sql
CREATE OR REPLACE FUNCTION cycle_shopping_items(p_cycle_id UUID)
RETURNS TABLE (
  food_id UUID, food_name TEXT, unit TEXT,
  total_amount NUMERIC, sources JSONB
) AS $$
  WITH batch_src AS (
    SELECT ri.food_id, ri.food_name, ri.unit,
           ri.amount_per_portion * pb.portions AS amount,
           'Topf ' || r.name AS source
    FROM prep_batches pb
    JOIN recipes r      ON r.id = pb.recipe_id
    JOIN recipe_items ri ON ri.recipe_id = r.id
    WHERE pb.cycle_id = p_cycle_id
  ),
  free_src AS (
    SELECT mi.food_id, mi.food_name, mi.unit, mi.amount, m.name AS source
    FROM meal_items mi
    JOIN meals m      ON m.id = mi.meal_id
    JOIN meal_plans p ON p.id = m.plan_id
    JOIN prep_cycles c ON c.id = p_cycle_id
    WHERE p.date BETWEEN c.start_date AND c.end_date
  ),
  all_src AS (SELECT * FROM batch_src UNION ALL SELECT * FROM free_src)
  SELECT COALESCE(food_id, NULL),
         min(food_name),
         min(unit),
         sum(amount),
         jsonb_agg(jsonb_build_object('source', source, 'amount', amount) ORDER BY source)
  FROM all_src
  GROUP BY COALESCE(food_id::text, lower(trim(food_name)));
$$ LANGUAGE sql STABLE;
```
Einheiten-Normalisierung (`dl`/`l` → `ml`) passiert vor dem `GROUP BY` — in der finalen Fassung über `toBaseUnit`-Äquivalent in SQL.

- [ ] **Step 2: Akzeptanzkriterium 1, zweiter Teil**

Mit dem Testzyklus aus Task 2.2 Step 3:
```sql
SELECT food_name, total_amount FROM cycle_shopping_items('<test-id>') WHERE food_name ILIKE '%kartoffel%';
```
Erwartet: **eine** Zeile, `total_amount = 1500`.

- [ ] **Step 3: Seite umbauen**

Sync über den Zyklus statt über einen Datumsbereich. Positionen aufklappbar mit Herkunft aus `sources`. `roundForShopping` nur für die Anzeige/Einkaufsmenge. `ownedItems` bleibt und reduziert die Einkaufs-, nicht die Kochmenge. `shopping_list` bekommt `is_generated BOOLEAN DEFAULT FALSE` und `cycle_id UUID`; beim Sync werden nur generierte Positionen ersetzt, manuelle bleiben.

- [ ] **Step 4: Build + Lint + Commit**

---

# Phase 4 — Bedienung und Struktur

### Task 4.1: `components/ui/AmountInput.tsx` (höchste Priorität)

- [ ] **Step 1: Komponente**

Props: `value: number`, `unit: string`, `onCommit(v: number) => void`, `integer?: boolean`. Verhalten: Tap öffnet `<input inputMode="decimal">`, darunter Stepper `−25 / −10 / +10 / +25` (bei `integer` bzw. `unit==='stk'`: `−1 / +1`). `onChange` aktualisiert lokalen State für die Live-Vorschau, `onCommit` feuert bei Enter oder `blur`. Mindesthöhe 44 px.

- [ ] **Step 2: An drei Stellen einsetzen** — Zutat in geplanter Mahlzeit (Tagesansicht), Zutat im Rezept (pro Portion), Portionenzahl eines Batches. Die Trigger aus Phase 0.5/2.1 ziehen die Summen automatisch nach; das Frontend lädt nur neu.

- [ ] **Step 3: Undo-Toast statt Bestätigungsdialog**

`Toast.tsx` um eine Aktions-Schaltfläche erweitern (`showToast(msg, { actionLabel, onAction, duration: 5000 })`). Löschen entfernt sofort und bietet 5 Sekunden „Rückgängig", das den Datensatz wiederherstellt.

- [ ] **Step 4: Long-press „verschieben nach"** auf Mahlzeit und Box (anderer Tag / anderer Slot).

- [ ] **Step 5: Build + Lint + Commit**

### Task 4.2: Navigation und `/plan`

- [ ] Fünf Slots: Heute `/` · Plan `/plan` · Prep `/prep` · Einkauf `/einkaufsliste` · Mehr `/mehr`.
- [ ] `/plan` führt Kalender, Wochenübersicht und Tagesdetail zusammen; `/kalender` und `/tag/[datum]` entfallen (Redirects nicht nötig, App ist nicht öffentlich verlinkt).
- [ ] `/mehr` verlinkt Rezepte, Datenbank, Auswertung, Einstellungen.
- [ ] Swipe vereinheitlichen: in `app/page.tsx` und `app/einkaufsliste/page.tsx` den Bereichswechsel entfernen; links/rechts heisst überall Zeit vorwärts/rückwärts.
- [ ] Build + Lint + Commit.

### Task 4.3: Standard-Frühstück

- [ ] `settings`-Key `default_breakfast_recipe_id` (+ optional `default_snack_recipe_id`), Auswahl in `app/einstellungen/`.
- [ ] Beim Anlegen eines Zyklus und beim Öffnen eines leeren Tages automatisch als Frühstück setzen, pro Tag überschreib- und löschbar.
- [ ] Build + Lint + Commit.

### Task 4.4: Freie Tage

- [ ] `day_markers.is_free BOOLEAN NOT NULL DEFAULT FALSE` (Migration `0009`, bereits in Phase 2 angewandt).
- [ ] Zyklus-Planer überspringt freie Tage bei der Boxen-Verteilung.
- [ ] Tagesansicht eines freien Tages: Restbudget prominent, Schnell-Eintrag über Favoriten und zuletzt verwendete Mahlzeiten.
- [ ] Build + Lint + Commit.

---

# Phase 5 — Redesign „Organic"

### Task 5.1: Fonts und Tokens

- [ ] `next/font/google` in `app/layout.tsx`: `Caprasimo` (400) → `--font-caprasimo`, `Figtree` (400/500/600/700) → `--font-figtree`.
- [ ] `app/globals.css`: `@theme`-Block exakt mit den Tokens aus dem Spec, plus `--font-display`/`--font-body`. Kein Dark Mode.
- [ ] `lib/mealTypes.ts` und `lib/settings.ts` geben Token-Namen zurück (`'var(--color-meal-mittagessen)'` bzw. `'var(--color-danger)'`), keine Hex-Werte.
- [ ] Build + Lint + Commit.

### Task 5.2: UI-Bausteine **vorab**

- [ ] `components/ui/`: `Card.tsx`, `Pill.tsx`, `Button.tsx`, `StatCard.tsx`, `SegmentedControl.tsx`, `Checkbox.tsx` — Spezifikation exakt nach Spec 5.3.
- [ ] `StatCard` mit horizontalem Balken (6 px, `--radius-pill`), Varianten `goal` (Erreichen gut) und `limit` (Überschreiten schlecht).
- [ ] Commit.

### Task 5.3: Seitenweise Umstellung

Reihenfolge, nach jedem Schritt lauffähig und je ein Commit:
- [ ] Layout + Navigation
- [ ] Dashboard („Heute") — `ArcProgress` entfernen, drei `StatCard` im Grid
- [ ] `/plan`
- [ ] `/prep` + Kochliste
- [ ] `/einkaufsliste`
- [ ] `/rezepte`, `/datenbank`, `/einstellungen`, `/mehr`

- [ ] **Abschlusskontrolle:** kein Hex-Wert mehr in Komponenten und Seiten:

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b" app components lib | grep -v globals.css
```
Erwartet: keine Treffer. Zusätzlich `grep -rn "ArcProgress" app components` → keine Treffer.

---

# Phase 6 — Auswertung

### Task 6.1: `app/auswertung/`

- [ ] Wochenschnitt kcal/Protein/Carbs/Fett/Kosten mit Zielerreichung in Prozent.
- [ ] 8- bzw. 12-Wochen-Verlauf als handgeschriebenes SVG-Liniendiagramm (keine Chart-Bibliothek).
- [ ] Heatmap der Zielerreichung pro Wochentag.
- [ ] Kostenverlauf pro Woche und pro Portion.
- [ ] Ranking „Protein pro Franken" und „Kalorien pro Franken", direkt aus `foods`:
  `protein_per_100 / NULLIF(cost_per_100,0)`.
- [ ] Meistgekochte Rezepte und meistverwendete Lebensmittel der letzten 90 Tage.
- [ ] Vergleich Meal-Prep-Tage (haben `batch_portions`) gegen freie Tage (`day_markers.is_free`).
- [ ] Build + Lint + Commit.

---

# Abschluss

### Task 7.1: Legacy-Tabellen entfernen

- [ ] `supabase/migrations/0010_drop_legacy_tables.sql`: `meal_templates`, `meal_template_items`, `notes`, `note_items`, `plan_templates`, `plan_template_days`, `plan_template_meals`, `plan_template_items`, `grosse_menus`, `grosse_menu_meals`, `grosse_menu_items`, `menu_distribution_log` droppen. **Erst ausführen**, nachdem die `*_backup_20260725`-Tabellen verifiziert sind. Die Backups bleiben bestehen.

### Task 7.2: README

- [ ] `README.md` ersetzen: Datenmodell, Kernkonzepte (Rezept pro Portion → Zyklus → Batch/Topf → Box), Migrationsablauf, Design-Tokens, Setup, **und der Sicherheitshinweis**: RLS steht auf `allow_all` für `anon`, alle Daten sind für jeden mit der URL les- und schreibbar; Vorschlag für einen späteren Auth-Schritt (Supabase Auth + `user_id`-Spalte + Policies auf `auth.uid()`).

### Task 7.3: Akzeptanzkriterien durchgehen

- [ ] Alle 19 Kriterien aus dem Spec einzeln prüfen und das Ergebnis festhalten.

---

## Self-Review

**Spec-Abdeckung:** Phase 0 → Tasks 0.1–0.6 · Phase 1 → 1.1–1.3 · Phase 2 → 2.1–2.2 · Phase 3 → 3.1–3.3 · Phase 4 → 4.1–4.4 · Phase 5 → 5.1–5.3 · Phase 6 → 6.1 · Anforderungen README/RLS/Legacy → 7.1–7.3. Erhaltene Features (Listen-Import, Lebensmittel-Kategorien, Event-Regeln, Export, Tagesziele, „habe ich schon zuhause") sind in 0.4, 1.3 Step 4, 3.3 Step 3 und 4.3 verankert.

**Bekannte Abweichung vom Spec:** `0009_day_markers_free.sql` wird auf Phase 2 vorgezogen, weil der Zyklus-Planer freie Tage überspringen muss (Spec 2.2 Punkt 1), die Spalte aber erst in Phase 4.4 definiert wäre. Ohne das Vorziehen wäre Phase 2 nicht spec-konform lauffähig.

**Typkonsistenz:** `MealTypeKey` durchgängig · `calcNutrition` liefert überall `{kcal, protein, carbs, fat, cost}` · `formatAmount`/`roundForShopping`/`toBaseUnit` mit identischen Signaturen in Task 3.1 und ihren Verwendungen · `recalc_plan_totals_for_date(DATE)` ersetzt `recalc_plan_totals(UUID)` ab Task 2.1 und wird dort explizit als Wrapper beibehalten.
