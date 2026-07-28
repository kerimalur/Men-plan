import { supabase, rows, row, maybeRow, ok } from './client'
import type { MealTypeKey } from '@/lib/mealTypes'
import type { BatchPortion, DayMarker, Meal, MealItem, MealPlan, PrepBatch, Recipe } from './types'

const PLAN_COLUMNS = 'id, date, kcal_total, protein_total, carbs_total, fat_total, cost_total, created_at'

const MEAL_COLUMNS =
  'id, plan_id, meal_type, name, kcal_total, protein_total, carbs_total, fat_total, cost_total, eaten, created_at'

const ITEM_COLUMNS =
  'id, meal_id, food_id, food_name, amount, unit, kcal, protein, carbs, fat, cost, eaten, created_at'

// ── Tagespläne ──────────────────────────────────────────────────────────────

export async function getPlanByDate(date: string): Promise<MealPlan | null> {
  const res = await supabase.from('meal_plans').select(PLAN_COLUMNS).eq('date', date).maybeSingle()
  return maybeRow<MealPlan>(res, 'Tagesplan laden')
}

export async function ensurePlan(date: string): Promise<MealPlan> {
  const existing = await getPlanByDate(date)
  if (existing) return existing
  const res = await supabase.from('meal_plans').insert({ date }).select(PLAN_COLUMNS).single()
  return row<MealPlan>(res, 'Tagesplan anlegen')
}

export async function getPlansInRange(from: string, to: string): Promise<MealPlan[]> {
  const res = await supabase.from('meal_plans').select(PLAN_COLUMNS)
    .gte('date', from).lte('date', to).order('date')
  return rows<MealPlan>(res, 'Tagespläne laden')
}

export async function deletePlan(id: string): Promise<void> {
  ok(await supabase.from('meal_plans').delete().eq('id', id), 'Tagesplan löschen')
}

/**
 * Überträgt die freien Mahlzeiten eines Tages auf ein anderes Datum.
 *
 * `copy` lässt den Quelltag stehen, `move` löscht den Quell-Tagesplan danach —
 * die Kaskade aus 0001 räumt Mahlzeiten und Positionen mit weg. Ein bereits
 * geplanter Zieltag wird ergänzt, nicht ersetzt: meals hat keine Eindeutigkeit
 * auf (plan_id, meal_type), zwei Mittagessen sind also erlaubt.
 *
 * Summen werden NICHT von Hand gerechnet — die Trigger aus 0004 ziehen sie
 * beim Insert der Positionen über meals bis in meal_plans nach.
 *
 * Vorgekochte Boxen (`batch_portions`) bleiben unberührt. Sie hängen an einem
 * Topf des Prep-Zyklus und existieren physisch genau einmal; sie liessen sich
 * weder kopieren noch sinnvoll ohne den Zyklus verschieben.
 *
 * Häkchen: beim Kopieren beginnt der Zieltag ungegessen, beim Verschieben
 * wandert der Stand mit (dieselbe Mahlzeit, nur an einem anderen Tag).
 *
 * @returns Anzahl übertragener Mahlzeiten
 */
export async function copyDayMeals(
  fromDate: string,
  toDate: string,
  mode: 'copy' | 'move' = 'copy',
): Promise<number> {
  if (fromDate === toDate) return 0

  const source = await getPlanByDate(fromDate)
  if (!source) return 0

  const meals = await getMealsForPlan(source.id)
  if (meals.length > 0) {
    const target = await ensurePlan(toDate)
    for (const m of meals) {
      const copy = await createMeal(target.id, m.meal_type, m.name)
      await addMealItems((m.meal_items ?? []).map(i => ({
        meal_id:   copy.id,
        food_id:   i.food_id,
        food_name: i.food_name,
        amount:    i.amount,
        unit:      i.unit,
        kcal:      i.kcal,
        protein:   i.protein,
        carbs:     i.carbs,
        fat:       i.fat,
        cost:      i.cost,
        eaten:     mode === 'move' ? i.eaten : false,
      })))
    }
  }

  if (mode === 'move') await deletePlan(source.id)
  return meals.length
}

// ── Mahlzeiten (freie Tage, Ad-hoc) ─────────────────────────────────────────

export async function getMealsForPlan(planId: string): Promise<Meal[]> {
  const res = await supabase.from('meals')
    .select(`${MEAL_COLUMNS}, meal_items(${ITEM_COLUMNS})`)
    .eq('plan_id', planId).order('created_at')
  return rows<Meal>(res, 'Mahlzeiten laden')
}

export async function createMeal(planId: string, mealType: MealTypeKey, name: string): Promise<Meal> {
  const res = await supabase.from('meals')
    .insert({ plan_id: planId, meal_type: mealType, name })
    .select(MEAL_COLUMNS).single()
  return row<Meal>(res, 'Mahlzeit anlegen')
}

export async function deleteMeal(id: string): Promise<void> {
  ok(await supabase.from('meals').delete().eq('id', id), 'Mahlzeit löschen')
}

/** Long-press „verschieben nach": anderer Tag oder anderer Slot. */
export async function moveMeal(id: string, planId: string, mealType: MealTypeKey): Promise<void> {
  ok(await supabase.from('meals').update({ plan_id: planId, meal_type: mealType }).eq('id', id), 'Mahlzeit verschieben')
}

/**
 * Ganze Mahlzeit abhaken. Der Trigger aus Migration 0011 zieht alle Positionen
 * mit — ein zweiter Schreibvorgang von hier aus ist also weder nötig noch
 * erwünscht.
 */
export async function setMealEaten(id: string, eaten: boolean): Promise<void> {
  ok(await supabase.from('meals').update({ eaten }).eq('id', id), 'Mahlzeit abhaken')
}

// ── Positionen ──────────────────────────────────────────────────────────────

export interface MealItemInput {
  meal_id: string
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  carbs?: number
  fat?: number
  cost: number
  /** Beim Bearbeiten einer Mahlzeit: Häkchen der Position erhalten. */
  eaten?: boolean
}

/**
 * Die Spalten werden einzeln aufgezählt statt die Eingabe durchzureichen.
 * Grund: MealModal führt an seinen Positionen reine Anzeige-Flags mit
 * (isCustom, isQuick, customKcalPer100). Landeten die im Insert, bräche
 * PostgREST mit „Could not find the column" ab.
 */
export async function addMealItems(items: MealItemInput[]): Promise<void> {
  if (items.length === 0) return
  ok(
    await supabase.from('meal_items').insert(
      items.map(i => ({
        meal_id:   i.meal_id,
        food_id:   i.food_id,
        food_name: i.food_name,
        amount:    i.amount,
        unit:      i.unit,
        kcal:      i.kcal,
        protein:   i.protein,
        carbs:     i.carbs ?? 0,
        fat:       i.fat ?? 0,
        cost:      i.cost,
        eaten:     i.eaten ?? false,
      }))
    ),
    'Zutaten speichern'
  )
}

/**
 * Einzelne Position abhaken. Die Kopplung an die Mahlzeit macht der Trigger
 * aus Migration 0011: sind danach alle Positionen abgehakt, gilt die Mahlzeit
 * als gegessen; fehlt eine, gilt sie es nicht mehr.
 */
export async function setMealItemEaten(id: string, eaten: boolean): Promise<void> {
  ok(await supabase.from('meal_items').update({ eaten }).eq('id', id), 'Position abhaken')
}

export async function deleteMealItems(mealId: string): Promise<void> {
  ok(await supabase.from('meal_items').delete().eq('meal_id', mealId), 'Zutaten löschen')
}

export async function deleteMealItem(id: string): Promise<void> {
  ok(await supabase.from('meal_items').delete().eq('id', id), 'Zutat löschen')
}

/**
 * Inline-Bearbeitung einer Menge. Nährwerte skalieren proportional,
 * die Summen ziehen per Trigger nach (Migration 0004).
 */
export async function updateMealItemAmount(item: MealItem, newAmount: number): Promise<void> {
  if (newAmount <= 0 || item.amount <= 0) return
  const ratio = newAmount / item.amount
  ok(
    await supabase.from('meal_items').update({
      amount:  newAmount,
      kcal:    Math.round(item.kcal    * ratio * 100)   / 100,
      protein: Math.round(item.protein * ratio * 1000)  / 1000,
      carbs:   Math.round(item.carbs   * ratio * 1000)  / 1000,
      fat:     Math.round(item.fat     * ratio * 1000)  / 1000,
      cost:    Math.round(item.cost    * ratio * 10000) / 10000,
    }).eq('id', item.id),
    'Menge speichern'
  )
}

// ── Tagesmarker ─────────────────────────────────────────────────────────────

export async function getMarkersInRange(from: string, to: string): Promise<DayMarker[]> {
  const res = await supabase.from('day_markers')
    .select('date, training, eingeladen, is_free, notiz')
    .gte('date', from).lte('date', to)
  return rows<DayMarker>(res, 'Tagesmarker laden')
}

export async function setDayMarker(date: string, patch: Partial<Omit<DayMarker, 'date'>>): Promise<void> {
  ok(
    await supabase.from('day_markers').upsert({ date, ...patch }, { onConflict: 'date' }),
    'Tagesmarker speichern'
  )
}

// ── Zusammengeführte Tagesansicht ───────────────────────────────────────────

export type PortionWithBatch = BatchPortion & {
  prep_batches: PrepBatch & { recipes: Pick<Recipe, 'id' | 'name'> }
}

export interface DayView {
  date: string
  plan: MealPlan | null
  marker: DayMarker | null
  /** Freie Mahlzeiten aus meals/meal_items. */
  meals: Meal[]
  /** Vorgekochte Boxen aus batch_portions. */
  portions: PortionWithBatch[]
}

/**
 * Die Tagesansicht führt beide Quellen zusammen: Boxen aus dem Prep-Zyklus
 * und frei geplante Einzelmahlzeiten.
 */
/**
 * Setzt das in den Einstellungen hinterlegte Standard-Frühstück, falls der
 * Slot an diesem Tag noch leer ist.
 *
 * Wird beim Anlegen eines Zyklus und beim Öffnen eines leeren Tages gerufen.
 * Überschreibt nie: ist der Slot belegt — durch eine Box oder eine freie
 * Mahlzeit — passiert nichts. Damit bleibt das Frühstück pro Tag
 * überschreib- und löschbar.
 */
export async function applyDefaultMeals(date: string): Promise<boolean> {
  const { loadSettings } = await import('@/lib/settings')
  const { getRecipe } = await import('./recipes')
  const { getFoodsByIds } = await import('./foods')
  const { calcNutrition } = await import('@/lib/calculations')

  const settings = await loadSettings()
  const targets: Array<[MealTypeKey, string]> = []
  if (settings.default_breakfast_recipe_id) targets.push(['fruehstueck', settings.default_breakfast_recipe_id])
  if (settings.default_snack_recipe_id)     targets.push(['snack', settings.default_snack_recipe_id])
  if (targets.length === 0) return false

  const plan = await ensurePlan(date)

  const takenMeals = rows<{ meal_type: string }>(
    await supabase.from('meals').select('meal_type').eq('plan_id', plan.id),
    'Belegte Slots prüfen'
  )
  const takenBoxes = rows<{ meal_type: string }>(
    await supabase.from('batch_portions').select('meal_type').eq('date', date),
    'Belegte Slots prüfen'
  )
  const taken = new Set([...takenMeals, ...takenBoxes].map(r => r.meal_type))

  let applied = false
  for (const [slot, recipeId] of targets) {
    if (taken.has(slot)) continue

    const recipe = await getRecipe(recipeId)
    if (!recipe) continue

    const items = recipe.recipe_items ?? []
    const foods = await getFoodsByIds(items.map(i => i.food_id).filter(Boolean) as string[])
    const byId = new Map(foods.map(f => [f.id, f]))

    const meal = await createMeal(plan.id, slot, recipe.name)
    await addMealItems(items.map(i => {
      const food = i.food_id ? byId.get(i.food_id) : undefined
      const n = food
        ? calcNutrition(food, i.amount_per_portion, i.unit)
        : { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 }
      return {
        meal_id: meal.id,
        food_id: i.food_id,
        food_name: i.food_name,
        amount: i.amount_per_portion,
        unit: i.unit,
        kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat, cost: n.cost,
      }
    }))
    applied = true
  }
  return applied
}

export async function getDayView(date: string): Promise<DayView> {
  const plan = await getPlanByDate(date)
  const [meals, portions, markers] = await Promise.all([
    plan ? getMealsForPlan(plan.id) : Promise.resolve([] as Meal[]),
    supabase.from('batch_portions')
      .select('id, batch_id, date, meal_type, consumed, prep_batches(id, cycle_id, recipe_id, meal_type, portions, kcal_per_portion, protein_per_portion, carbs_per_portion, fat_per_portion, cost_per_portion, created_at, recipes(id, name))')
      .eq('date', date)
      .then(res => rows<PortionWithBatch>(res, 'Boxen laden')),
    getMarkersInRange(date, date),
  ])
  return { date, plan, marker: markers[0] ?? null, meals, portions }
}
