/**
 * Domänentypen der Menüplan-Tabellen.
 *
 * ----------------------------------------------------------------------------
 * ABWEICHUNG VOM UMBAU-AUFTRAG, dokumentiert:
 *
 * Der Auftrag verlangt generierte Supabase-Typen (`supabase gen types
 * typescript`). Das war beim Schreiben nicht möglich — der MCP-Connector zeigt
 * auf ein anderes Supabase-Konto und die CLI ist nicht installiert.
 *
 * Diese Datei ist deshalb von Hand geschrieben und bildet exakt den Stand nach
 * Migration 0007 ab. Sie ist so aufgebaut, dass sie später ohne Änderungen an
 * den Aufrufern durch die generierte Datei ersetzt werden kann: die Module in
 * lib/db/ verwenden ausschliesslich die hier exportierten Row-Typen.
 *
 * Wenn der Zugang steht:
 *   supabase gen types typescript --project-id kvpexrorkqmxnzqvexga > lib/db/generated.ts
 * und die Row-Typen hier auf `Database['public']['Tables'][…]['Row']` umbiegen.
 * ----------------------------------------------------------------------------
 */

import type { MealTypeKey } from '@/lib/mealTypes'

/** Einheit, in der ein Lebensmittel in der Datenbank hinterlegt ist. */
export type FoodUnit = 'g' | 'ml' | 'stk'

/** Einheit, die an einer Position eingetragen sein darf. */
export type ItemUnit = 'g' | 'ml' | 'dl' | 'l' | 'stk'

export type RecipeStatus = 'idee' | 'zutaten_erfasst' | 'bereit'

export type CycleStatus = 'geplant' | 'eingekauft' | 'gekocht' | 'erledigt'

// ── Lebensmittel ────────────────────────────────────────────────────────────

export interface FoodCategory {
  id: string
  name: string
  created_at: string | null
}

export interface Food {
  id: string
  name: string
  calories_per_100: number
  protein_per_100: number
  carbs_per_100: number
  fat_per_100: number
  cost_per_100: number
  unit: FoodUnit
  category_id: string | null
  /**
   * Nur bei unit='stk' gesetzt: Nährwerte pro 100 g, damit dasselbe
   * Lebensmittel wahlweise in Stück oder Gramm erfasst werden kann.
   * Kein Legacy — siehe Kommentar in supabase/migrations/0003_macros.sql.
   */
  calories_per_100g: number | null
  protein_per_100g: number | null
  created_at: string | null
}

// ── Tagesplanung ────────────────────────────────────────────────────────────

export interface MealPlan {
  id: string
  date: string
  kcal_total: number
  protein_total: number
  carbs_total: number
  fat_total: number
  cost_total: number
  created_at: string | null
}

export interface MealItem {
  id: string
  meal_id: string
  food_id: string | null
  food_name: string
  amount: number
  unit: ItemUnit
  kcal: number
  protein: number
  carbs: number
  fat: number
  cost: number
  /**
   * Einzeln abgehakt. Gekoppelt an Meal.eaten (Migration 0011):
   * alle Positionen abgehakt → Mahlzeit gegessen, Mahlzeit abgehakt →
   * alle Positionen gegessen. Die Kopplung läuft in der Datenbank.
   */
  eaten: boolean
  created_at: string | null
}

export interface Meal {
  id: string
  plan_id: string
  meal_type: MealTypeKey
  name: string
  kcal_total: number
  protein_total: number
  carbs_total: number
  fat_total: number
  cost_total: number
  /** Abgeleitet, sobald die Mahlzeit Positionen hat — siehe MealItem.eaten. */
  eaten: boolean
  created_at: string | null
  meal_items?: MealItem[]
}

export interface DayMarker {
  date: string
  training: boolean
  eingeladen: boolean
  /** Frei geplanter Tag: bekommt vom Zyklus-Planer keine Boxen zugewiesen. */
  is_free: boolean
  notiz: string | null
}

// ── Rezepte ─────────────────────────────────────────────────────────────────

export interface TemplateCategory {
  id: string
  name: string
}

export interface RecipeItem {
  id: string
  recipe_id: string
  food_id: string | null
  food_name: string
  /** Menge für EINE Portion. Alles Weitere ist Multiplikation. */
  amount_per_portion: number
  unit: ItemUnit
  sort_order: number
}

export interface Recipe {
  id: string
  name: string
  /** Vorfilter, keine Sperre: jede Auswahl bietet „alle Rezepte" an. */
  meal_type: MealTypeKey
  category_id: string | null
  status: RecipeStatus
  freetext: string
  default_portions: number
  is_favorite: boolean
  created_at: string | null
  updated_at: string | null
  recipe_items?: RecipeItem[]
}

// ── Prep-Zyklen ─────────────────────────────────────────────────────────────

export interface PrepCycle {
  id: string
  name: string
  cook_date: string
  start_date: string
  end_date: string
  status: CycleStatus
  created_at: string | null
  prep_batches?: PrepBatch[]
}

/** Ein Topf. */
export interface PrepBatch {
  id: string
  cycle_id: string
  recipe_id: string
  meal_type: MealTypeKey
  /** Anzahl Boxen. */
  portions: number
  // Eingefrorene Werte pro Portion zum Zeitpunkt des Anlegens.
  kcal_per_portion: number
  protein_per_portion: number
  carbs_per_portion: number
  fat_per_portion: number
  cost_per_portion: number
  created_at: string | null
  recipes?: Recipe
  batch_portions?: BatchPortion[]
}

/** Eine Box, einem Tag und Slot zugeordnet. */
export interface BatchPortion {
  id: string
  batch_id: string
  date: string
  meal_type: MealTypeKey
  consumed: boolean
}

// ── Einkauf, Einstellungen, Regeln ──────────────────────────────────────────

export interface ShoppingItem {
  id: string
  item: string
  quantity: string | null
  checked: boolean
  /** Vom Zyklus-Sync erzeugt: wird beim nächsten Sync ersetzt. */
  is_generated: boolean
  cycle_id: string | null
  created_at: string | null
}

/** Eine Zeile aus der RPC cycle_shopping_items(). */
export interface CycleShoppingItem {
  food_id: string | null
  food_name: string
  unit: FoodUnit
  total_amount: number
  /** Herkunft der Menge: „900 g aus Topf Mittag" usw. */
  sources: { source: string; amount: number }[]
}

export interface EventMealRule {
  id: string
  event_type: 'training' | 'eingeladen'
  meal_type: MealTypeKey
  recipe_id: string
  recipes?: Recipe
}
