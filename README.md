# Menüplan

Meal-Prep-Planung für einen Haushalt: Rezepte definieren Mengen **pro Portion**,
ein Kochzyklus multipliziert sie auf Töpfe und Boxen, daraus fallen Kochliste
und Einkaufsliste automatisch ab.

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · Supabase.

---

## Warum die App so gebaut ist

Der reale Ablauf ist **pro Topf**, nicht pro Tag:

- An 5 von 7 Tagen gibt es ausschliesslich Meal Prep, 2 Tage sind frei.
- Gekocht wird 2× pro Woche. Ein Kochzyklus deckt 2 oder 3 Tage ab.
- Pro Zyklus entstehen ein Mittags- und ein Abendgericht, jeweils in 2–3
  Portionen, die in Boxen aufgeteilt werden.

Die frühere Version rechnete pro Tag und zwang zum Hochrechnen im Kopf:

> Das Mittagsrezept hat 300 g Kartoffeln pro Portion, bei 3 Portionen also 900 g.
> Das Abendrezept hat 200 g pro Portion, bei 3 Portionen 600 g.
> Einkaufen muss ich 1500 g.

Genau diese Rechnung macht jetzt die Software.

## Kernkonzepte

| Begriff | Bedeutung |
|---|---|
| **Rezept** (`recipes`) | Zutaten mit Mengen **pro Portion**. Alles Weitere ist Multiplikation. |
| **Zyklus** (`prep_cycles`) | Ein Kochtag plus der Zeitraum, den er abdeckt. |
| **Topf / Batch** (`prep_batches`) | Ein Rezept × Anzahl Portionen. Hält die Nährwerte pro Portion **eingefroren**. |
| **Box** (`batch_portions`) | Eine Portion, einem Datum und Mahlzeit-Slot zugeordnet. |

Warum eingefroren: ändert sich ein Rezept, sollen bereits gekochte Zyklen nicht
rückwirkend andere Werte zeigen. Solange ein Zyklus `geplant` ist, folgen die
Batch-Werte dem Rezept; ab `eingekauft` bleiben sie stehen.

`recipes.meal_type` ist ein **Vorfilter, keine Sperre**. Jede Rezeptauswahl
bietet „alle Rezepte" an — sonst fände man im Abendessen-Slot fast nichts,
weil bei der Migration alle vormaligen Hauptmahlzeiten auf `mittagessen`
gelandet sind.

## Datenmodell

```
foods ──┬─→ recipe_items ──→ recipes ──→ prep_batches ──→ batch_portions ──→ (Datum, Slot)
        │                                     ↑
        └─→ meal_items ────→ meals ──→ meal_plans(date)
```

Zwei Quellen speisen einen Tag:

- **Boxen** aus `batch_portions` — vorgekochtes Meal Prep
- **Freie Mahlzeiten** aus `meals` / `meal_items` — für freie Tage und Ad-hoc

`meal_plans.kcal_total` und Geschwister addieren beide Quellen. Das passiert in
Postgres, nicht im Frontend: Trigger auf `meal_items`, `meals`, `batch_portions`
und `prep_batches` halten die Summen aktuell. Die App schreibt nur Positionen.

Weitere Tabellen: `foods`, `food_categories`, `template_categories`,
`shopping_list`, `settings`, `day_markers`, `event_meal_rules`.

### Einheiten

`foods.unit` ist `g`, `ml` oder `stk`. Eingetragen werden darf zusätzlich `dl`
und `l`; `lib/units.ts` normalisiert vor jeder Aggregation auf die Basis, sonst
würden 6 dl und 400 ml zu „406" statt zu 1 l addiert.

`foods.calories_per_100g` / `protein_per_100g` sind **kein Altbestand**: bei
Lebensmitteln mit `unit='stk'` halten sie die Per-100-g-Werte, damit dasselbe
Lebensmittel wahlweise in Stück oder in Gramm erfasst werden kann.

### Rundung

Nährwerte und Kosten werden intern mit voller Genauigkeit gerechnet und erst
bei der Anzeige gerundet. Kosten liegen mit 4 Nachkommastellen in der Datenbank
und werden mit 2 angezeigt. `roundForShopping()` rundet ausschliesslich die
**Einkaufsmenge** auf (volle 100 g bzw. ganze Stück) — Nährwert- und
Kostenrechnung laufen weiter auf der exakt geplanten Menge.

## Struktur

```
app/
  page.tsx                    Heute: Kennzahlen, Boxen abhaken, Restbudget
  plan/                       Tag · Woche · Monat in einer Ansicht
  prep/                       Zyklus-Planer und Zyklus-Historie
  prep/[cycleId]/kochen/      Kochliste (Hochrechnung + Box-Aufteilung)
  einkaufsliste/              Aggregation über den Zyklus + freie Positionen
  rezepte/                    Rezepte mit Mengen pro Portion
  datenbank/                  Lebensmittel inkl. Listen-Import
  auswertung/                 Wochenschnitt, Verlauf, Rankings
  einstellungen/              Tagesziele, Standard-Frühstück, Event-Regeln
  mehr/                       Sammelseite für den fünften Nav-Slot
components/
  ui/                         Card · Pill · Button · StatCard · SegmentedControl
                              · Checkbox · AmountInput
  MealModal · RecipePicker · Navigation · Toast
lib/
  db/                         die einzige Stelle mit Supabase-Zugriffen
  calculations.ts             Nährwerte, Summen
  units.ts                    Mengen, Einheiten, Formatierung, Rundung
  dates.ts · mealTypes.ts · settings.ts · eventRules.ts · export.ts · useSwipe.ts
supabase/
  migrations/                 nummeriert, idempotent, vorwärtsgerichtet
  legacy/                     die alten schema*.sql, nur zur Nachvollziehbarkeit
tests/                        node:test, keine zusätzliche Abhängigkeit
```

Seiten und Komponenten enthalten **keine** rohen `supabase.from(...)`-Ketten —
alles läuft über typisierte Funktionen in `lib/db/`.

Die Navigation hat fünf Slots: **Heute · Plan · Prep · Einkauf · Mehr**.
Wischen bedeutet auf jeder Seite Zeit vorwärts bzw. rückwärts — nie einen
Wechsel zwischen Bereichen.

## Setup

```bash
npm install
```

`.env.local` anlegen:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

```bash
npm run dev     # Entwicklung
npm run build   # Produktionsbuild
npm run lint    # ESLint
npm test        # node --test über tests/
```

## Migrationen

`supabase/migrations/` ist nummeriert und wird **in dieser Reihenfolge**
ausgeführt. Jede Migration ist idempotent und vorwärtsgerichtet; am Dateiende
steht jeweils ein Verifikationsblock zum Nachprüfen.

| | |
|---|---|
| `0001_baseline` | Ist-Stand aller Tabellen |
| `0002_meal_types_canonical` | `hauptmahlzeit` → `mittagessen`, CHECKs vereinheitlicht |
| `0003_macros` | Kohlenhydrate und Fett |
| `0004_totals_triggers` | Summen per Trigger statt im Frontend |
| `0005_recipes` | `recipes` / `recipe_items` + Backups |
| `0006_recipes_migrate_data` | Vorlagen, Notizen, grosse Menüs → Rezepte |
| `0007_prep_cycles` | Zyklen, Töpfe, Boxen + erweiterte Tagessummen |
| `0008_shopping_aggregate` | RPC `cycle_shopping_items()` |
| `0009_fix_planned_batch_recalc` | Korrektur an `0007`: unerlaubtes LATERAL auf die UPDATE-Zieltabelle |
| `0010_drop_legacy_tables` | abgelöste Tabellen entfernen — **zuletzt** |

Reihenfolge ist nicht optional: `0002` muss Constraints droppen, bevor es Daten
ändert; `0004` referenziert Spalten aus `0003`; `0010` setzt die Verifikation
von `0006` voraus.

Vor den umbauenden Schritten legt `0005` Backup-Tabellen an
(`*_backup_20260725`). Die bleiben auch nach `0010` bestehen.

Als Regressionsschutz existiert `meal_plans_snapshot_20260725`: historische
Tagespläne müssen nach jedem Schritt dieselben Nährwerte zeigen wie vorher.
Geprüft wird mit `supabase/verify_acceptance.sql`.

Die Prüfung erlaubt eine halbe Anzeigeeinheit Toleranz. Grund: das alte
Frontend rundete in `sumItems()` die *laufende* Summe nach jeder Addition,
die Trigger summieren die gespeicherten Positionswerte und runden einmal.
An Tagen mit vielen Positionen ergibt das eine Rundungseinheit Unterschied —
zugunsten des neuen Werts. Gemessen betrifft das genau einen von 68 Tagen
(2026-07-02, +0.1 kcal). Echte Regressionen liegen um Größenordnungen
darüber und werden weiterhin gefunden.

## Design-Tokens

Sämtliche Farben, Radien und Schatten stehen im `@theme`-Block von
`app/globals.css`. In Komponenten und Seiten steht **kein einziger Hex-Wert** —
nur die daraus erzeugten Tailwind-Klassen (`bg-surface`, `text-text-muted`,
`rounded-card`, `shadow-card`).

Einzige Ausnahme: `lib/export.ts`. Der Export erzeugt ein eigenständiges
HTML-Dokument ohne Zugriff auf das Stylesheet, deshalb liegt dort eine
1:1-Kopie der Palette als `EXPORT_PALETTE`. Ändern sich die Tokens, muss sie
nachgezogen werden.

**Schriften:** Caprasimo (Display) und Figtree (Body), eingebunden über
`next/font/google`. Caprasimo ist kräftig und wird sparsam eingesetzt —
Seitentitel, Sektionsüberschriften, grosse Kennzahlen. Nie für Fliesstext,
Labels oder Navigation. Sie existiert nur in Gewicht 400, deshalb steht an
jeder Verwendungsstelle zusätzlich `font-normal`.

Kein Dark Mode.

## Sicherheit

> **Die Daten sind für jeden mit der URL les- und schreibbar.**

Row Level Security ist auf allen Tabellen aktiv, aber die Policy lautet
durchgehend:

```sql
CREATE POLICY allow_all ON <tabelle> FOR ALL TO anon USING (true) WITH CHECK (true);
```

Es gibt keine Authentifizierung. Wer die Projekt-URL und den öffentlichen
`anon`-Key kennt — beide stecken im ausgelieferten JavaScript — kann sämtliche
Datensätze lesen, ändern und löschen. Für eine private Meal-Prep-Planung ohne
personenbezogene Daten ist das eine bewusste Abwägung, keine Panne. Es ist aber
**keine** Grundlage, um weitere Personen oder sensiblere Daten aufzunehmen.

Zusätzlich zu bedenken: die Datenbank wird mit anderen Projekten geteilt. Die
Menüplan-Policies schützen deren Tabellen nicht — dort gelten eigene.

### Vorschlag für einen späteren Auth-Schritt

1. Supabase Auth aktivieren (Magic Link genügt für einen Einzelnutzer).
2. Auf allen Menüplan-Tabellen `user_id UUID REFERENCES auth.users(id)`
   ergänzen und mit der eigenen ID füllen.
3. `allow_all` ersetzen:
   ```sql
   DROP POLICY allow_all ON recipes;
   CREATE POLICY own_rows ON recipes FOR ALL TO authenticated
     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
   ```
4. `user_id` auf `NOT NULL` setzen und per Default `auth.uid()` füllen.
5. Frontend um Login-Screen und Session-Handling erweitern.

Reihenfolge beachten: Schritt 3 vor Schritt 2 sperrt einen selbst aus.
