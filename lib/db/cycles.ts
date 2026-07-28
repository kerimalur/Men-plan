import { supabase, rows, row, maybeRow, ok } from './client'
import { getFoodsByIds } from './foods'
import { getRecipe, nutritionPerPortion } from './recipes'
import { calcNutrition } from '@/lib/calculations'
import { toDateStr } from '@/lib/dates'
import { toBaseUnit } from '@/lib/units'
import type { MealTypeKey } from '@/lib/mealTypes'
import type { BatchPortion, CycleStatus, PrepBatch, PrepCycle, Recipe } from './types'

const CYCLE_COLUMNS = 'id, name, cook_date, start_date, end_date, status, created_at'

const BATCH_COLUMNS =
  'id, cycle_id, recipe_id, meal_type, portions, kcal_per_portion, protein_per_portion, ' +
  'carbs_per_portion, fat_per_portion, cost_per_portion, created_at'

const WITH_ALL =
  `${CYCLE_COLUMNS}, prep_batches(${BATCH_COLUMNS}, ` +
  `recipes(id, name, meal_type, default_portions, recipe_items(id, recipe_id, food_id, food_name, amount_per_portion, unit, sort_order)), ` +
  `batch_portions(id, batch_id, date, meal_type, consumed))`

// ── Lesen ───────────────────────────────────────────────────────────────────

export async function listCycles(): Promise<PrepCycle[]> {
  const res = await supabase.from('prep_cycles').select(WITH_ALL).order('cook_date', { ascending: false })
  return rows<PrepCycle>(res, 'Zyklen laden')
}

export async function getCycle(id: string): Promise<PrepCycle | null> {
  const res = await supabase.from('prep_cycles').select(WITH_ALL).eq('id', id).maybeSingle()
  return maybeRow<PrepCycle>(res, 'Zyklus laden')
}

/** Alle Boxen eines Datums, für die Tagesansicht. */
export async function getPortionsForRange(from: string, to: string): Promise<
  Array<BatchPortion & { prep_batches: PrepBatch & { recipes: Pick<Recipe, 'id' | 'name'> } }>
> {
  const res = await supabase
    .from('batch_portions')
    .select(`id, batch_id, date, meal_type, consumed, prep_batches(${BATCH_COLUMNS}, recipes(id, name))`)
    .gte('date', from).lte('date', to)
  return rows(res, 'Boxen laden')
}

// ── Datumshilfen ────────────────────────────────────────────────────────────

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(`${start}T12:00:00`)
  const last = new Date(`${end}T12:00:00`)
  while (d <= last) {
    out.push(toDateStr(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** Als frei markierte Tage bekommen keine Boxen. */
export async function freeDatesIn(dates: string[]): Promise<Set<string>> {
  if (dates.length === 0) return new Set()
  const res = await supabase.from('day_markers').select('date, is_free').in('date', dates).eq('is_free', true)
  return new Set(rows<{ date: string }>(res, 'Freie Tage laden').map(r => r.date))
}

// ── Schreiben ───────────────────────────────────────────────────────────────

export interface BatchInput {
  recipe_id: string
  meal_type: MealTypeKey
  portions: number
}

export interface CreateCycleInput {
  name?: string
  cook_date: string
  start_date: string
  end_date: string
  batches: BatchInput[]
}

/**
 * Legt Zyklus, Töpfe und Boxen in einem Rutsch an und stellt sicher, dass für
 * jeden abgedeckten Tag ein meal_plans-Eintrag existiert.
 *
 * Boxen werden automatisch eine pro Tag und Slot verteilt, freie Tage
 * übersprungen. Sind mehr Portionen als Tage vorhanden, bleiben die
 * überzähligen zunächst unverteilt — sie lassen sich im Raster von Hand
 * zuweisen.
 */
export async function createCycle(input: CreateCycleInput): Promise<PrepCycle> {
  const cycle = row<PrepCycle>(
    await supabase.from('prep_cycles').insert({
      name: input.name ?? '',
      cook_date: input.cook_date,
      start_date: input.start_date,
      end_date: input.end_date,
      status: 'geplant',
    }).select(CYCLE_COLUMNS).single(),
    'Zyklus anlegen'
  )

  const all = datesBetween(input.start_date, input.end_date)
  const free = await freeDatesIn(all)
  const usable = all.filter(d => !free.has(d))

  for (const b of input.batches) {
    const per = await perPortionValues(b.recipe_id)
    const batch = row<PrepBatch>(
      await supabase.from('prep_batches').insert({
        cycle_id: cycle.id,
        recipe_id: b.recipe_id,
        meal_type: b.meal_type,
        portions: b.portions,
        kcal_per_portion:    per.kcal,
        protein_per_portion: per.protein,
        carbs_per_portion:   per.carbs,
        fat_per_portion:     per.fat,
        cost_per_portion:    per.cost,
      }).select(BATCH_COLUMNS).single(),
      'Topf anlegen'
    )

    const targets = usable.slice(0, b.portions)
    if (targets.length > 0) {
      ok(
        await supabase.from('batch_portions').insert(
          targets.map(date => ({ batch_id: batch.id, date, meal_type: b.meal_type }))
        ),
        'Boxen verteilen'
      )
    }
  }

  await ensurePlansForDates(all)

  // Frühstück wird nicht im Zyklus gekocht, sondern kommt aus der
  // Standard-Mahlzeit — es erscheint im Raster damit bereits gefüllt.
  const { applyDefaultMeals } = await import('./plans')
  for (const d of all) await applyDefaultMeals(d)

  const full = await getCycle(cycle.id)
  return full ?? cycle
}

/** Nährwerte und Kosten pro Portion aus dem Rezept. */
export async function perPortionValues(recipeId: string) {
  const recipe = await getRecipe(recipeId)
  const items = recipe?.recipe_items ?? []
  const ids = items.map(i => i.food_id).filter(Boolean) as string[]
  const foods = await getFoodsByIds(ids)
  return nutritionPerPortion(items, new Map(foods.map(f => [f.id, f])))
}

export async function ensurePlansForDates(dates: string[]): Promise<void> {
  if (dates.length === 0) return
  const existing = rows<{ date: string }>(
    await supabase.from('meal_plans').select('date').in('date', dates),
    'Tagespläne prüfen'
  )
  const have = new Set(existing.map(r => r.date))
  const missing = dates.filter(d => !have.has(d))
  if (missing.length === 0) return
  ok(await supabase.from('meal_plans').insert(missing.map(date => ({ date }))), 'Tagespläne anlegen')
}

/**
 * Portionenzahl eines Topfes ändern.
 *
 * Boxen werden angeglichen: zu viele → die zuletzt angelegten fallen weg,
 * zu wenige → auf die noch freien Tage des Zyklus verteilen.
 */
export async function updateBatchPortions(batchId: string, portions: number): Promise<void> {
  const batch = row<PrepBatch & { prep_cycles: PrepCycle }>(
    await supabase.from('prep_batches')
      .select(`${BATCH_COLUMNS}, prep_cycles(${CYCLE_COLUMNS})`)
      .eq('id', batchId).single(),
    'Topf laden'
  )

  ok(await supabase.from('prep_batches').update({ portions }).eq('id', batchId), 'Portionen speichern')

  const current = rows<BatchPortion>(
    await supabase.from('batch_portions').select('id, batch_id, date, meal_type, consumed')
      .eq('batch_id', batchId).order('date'),
    'Boxen laden'
  )

  if (current.length > portions) {
    const drop = current.slice(portions).map(p => p.id)
    ok(await supabase.from('batch_portions').delete().in('id', drop), 'Boxen entfernen')
    return
  }

  if (current.length < portions) {
    const cycle = batch.prep_cycles
    const all = datesBetween(cycle.start_date, cycle.end_date)
    const free = await freeDatesIn(all)
    const taken = new Set(current.map(p => p.date))
    const open = all.filter(d => !free.has(d) && !taken.has(d))
    const add = open.slice(0, portions - current.length)
    if (add.length > 0) {
      ok(
        await supabase.from('batch_portions').insert(
          add.map(date => ({ batch_id: batchId, date, meal_type: batch.meal_type }))
        ),
        'Boxen ergänzen'
      )
    }
  }
}

/** Box auf einen anderen Tag oder in einen anderen Slot verschieben. */
export async function movePortion(portionId: string, date: string, mealType: MealTypeKey): Promise<void> {
  ok(
    await supabase.from('batch_portions').update({ date, meal_type: mealType }).eq('id', portionId),
    'Box verschieben'
  )
  await ensurePlansForDates([date])
}

/**
 * Box aus einem Tag entfernen.
 *
 * Nur die Tageszuordnung fällt weg. Der Topf behält seine Portionenzahl,
 * Einkaufs- und Kochliste des Zyklus bleiben unverändert — die Menge wurde ja
 * bereits eingekauft und gekocht. Wer wirklich weniger kochen will, ändert die
 * Portionen des Topfes im Zyklus (`updateBatchPortions`).
 */
export async function deletePortion(portionId: string): Promise<void> {
  ok(await supabase.from('batch_portions').delete().eq('id', portionId), 'Box entfernen')
}

/** Box wieder einsetzen — Gegenstück zu `deletePortion` für „Rückgängig". */
export async function addPortion(
  batchId: string, date: string, mealType: MealTypeKey, consumed = false,
): Promise<void> {
  ok(
    await supabase.from('batch_portions').insert({ batch_id: batchId, date, meal_type: mealType, consumed }),
    'Box einsetzen'
  )
  await ensurePlansForDates([date])
}

/**
 * Was steht im Kühlschrank?
 *
 * Ein Topf hat `portions` Boxen. Wie viele davon einem Tag zugeordnet sind,
 * steht in `batch_portions` — die Differenz liegt ungeplant im Kühlschrank und
 * lässt sich jedem beliebigen Tag zuweisen. Zyklen, deren letzter Tag mehr als
 * eine Woche zurückliegt, bleiben aussen vor: was so alt ist, ist gegessen.
 */
export interface FridgeBatch {
  batchId: string
  recipeName: string
  mealType: MealTypeKey
  cycleName: string
  portions: number
  /** Bereits einem Tag zugewiesen. */
  assigned: number
  /** Noch frei verfügbar (kann 0 sein — dann nur verschiebbar). */
  free: number
  kcalPerPortion: number
  proteinPerPortion: number
}

export async function listFridgeBatches(): Promise<FridgeBatch[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  const cycles = rows<PrepCycle & { prep_batches?: (PrepBatch & {
    recipes?: Pick<Recipe, 'id' | 'name'>
    batch_portions?: BatchPortion[]
  })[] }>(
    await supabase.from('prep_cycles')
      .select(
        `${CYCLE_COLUMNS}, prep_batches(${BATCH_COLUMNS}, recipes(id, name), ` +
        `batch_portions(id, batch_id, date, meal_type, consumed))`
      )
      .gte('end_date', toDateStr(cutoff))
      .order('cook_date', { ascending: false }),
    'Kühlschrank laden'
  )

  const out: FridgeBatch[] = []
  for (const c of cycles) {
    for (const b of c.prep_batches ?? []) {
      const assigned = (b.batch_portions ?? []).length
      out.push({
        batchId: b.id,
        recipeName: b.recipes?.name ?? 'Unbekanntes Rezept',
        mealType: b.meal_type,
        cycleName: c.name || new Date(`${c.cook_date}T12:00:00`).toLocaleDateString('de-CH'),
        portions: b.portions,
        assigned,
        free: Math.max(0, b.portions - assigned),
        kcalPerPortion: b.kcal_per_portion,
        proteinPerPortion: b.protein_per_portion,
      })
    }
  }
  return out
}

/**
 * Box in eine freie Mahlzeit dieses Tages umwandeln.
 *
 * Warum nicht die Box selbst bearbeitbar machen: eine Box ist eine Portion aus
 * einem gekochten Topf — Name und Zutaten gehören dem Rezept und gelten für
 * alle Boxen desselben Topfes. Wer nur DIESEN einen Tag anpassen will, löst die
 * Box heraus: die Zutaten wandern mit ihren Mengen pro Portion in eine normale
 * Mahlzeit, die sich frei umbenennen, ergänzen und kürzen lässt.
 *
 * Der Zyklus bleibt unangetastet (gekocht ist gekocht); nur die Tageszuordnung
 * dieser einen Portion verschwindet. Die Tagessummen bleiben gleich, weil die
 * Mahlzeit dieselben Werte trägt.
 */
export interface ConvertedPortion {
  mealId: string
  name: string
  mealType: MealTypeKey
  date: string
  items: {
    food_id: string | null
    food_name: string
    amount: number
    unit: string
    kcal: number
    protein: number
    carbs: number
    fat: number
    cost: number
    eaten: boolean
  }[]
}

export async function convertPortionToMeal(portionId: string): Promise<ConvertedPortion> {
  const portion = row<BatchPortion & {
    prep_batches: PrepBatch & { recipes?: Pick<Recipe, 'id' | 'name'> }
  }>(
    await supabase.from('batch_portions')
      .select(`id, batch_id, date, meal_type, consumed, prep_batches(${BATCH_COLUMNS}, recipes(id, name))`)
      .eq('id', portionId).single(),
    'Box laden'
  )

  const recipe = await getRecipe(portion.prep_batches.recipe_id)
  const recipeItems = recipe?.recipe_items ?? []
  const foods = await getFoodsByIds(recipeItems.map(i => i.food_id).filter(Boolean) as string[])
  const foodsById = new Map(foods.map(f => [f.id, f]))

  const items = recipeItems.map(i => {
    const food = i.food_id ? foodsById.get(i.food_id) : undefined
    const n = food
      ? calcNutrition(food, i.amount_per_portion, i.unit)
      : { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 }
    return {
      food_id: i.food_id,
      food_name: i.food_name,
      amount: i.amount_per_portion,
      unit: i.unit as string,
      kcal: n.kcal, protein: n.protein, carbs: n.carbs ?? 0, fat: n.fat ?? 0, cost: n.cost,
      eaten: portion.consumed,
    }
  })

  const { ensurePlan, createMeal, addMealItems, setMealEaten } = await import('./plans')
  const plan = await ensurePlan(portion.date)
  const name = portion.prep_batches.recipes?.name ?? 'Box'
  const mealType = portion.meal_type as MealTypeKey
  const meal = await createMeal(plan.id, mealType, name)

  await addMealItems(items.map(i => ({ ...i, meal_id: meal.id })))
  // Ohne Zutaten greift der Häkchen-Trigger nicht — dann direkt setzen.
  if (portion.consumed && items.length === 0) await setMealEaten(meal.id, true)

  await deletePortion(portionId)

  return { mealId: meal.id, name, mealType, date: portion.date, items }
}

export async function setPortionConsumed(portionId: string, consumed: boolean): Promise<void> {
  ok(await supabase.from('batch_portions').update({ consumed }).eq('id', portionId), 'Box abhaken')
}

export async function setCycleStatus(id: string, status: CycleStatus): Promise<void> {
  ok(await supabase.from('prep_cycles').update({ status }).eq('id', id), 'Status speichern')
}

export async function deleteCycle(id: string): Promise<void> {
  ok(await supabase.from('prep_cycles').delete().eq('id', id), 'Zyklus löschen')
}

// ── Kochliste ───────────────────────────────────────────────────────────────

export interface CookingIngredient {
  food_name: string
  /** Gesamtmenge für den Topf: amount_per_portion × portions. */
  total: number
  /** Menge für eine Box. */
  perPortion: number
  unit: string
}

export interface CookingBatch {
  batchId: string
  recipeName: string
  mealType: MealTypeKey
  portions: number
  ingredients: CookingIngredient[]
  costTotal: number
  costPerPortion: number
}

/**
 * Die Hochrechnung, die der Nutzer bisher im Kopf gemacht hat.
 * 300 g pro Portion × 3 Portionen = 900 g in den Topf, danach 3 Boxen à 300 g.
 */
export function buildCookingList(cycle: PrepCycle): CookingBatch[] {
  return (cycle.prep_batches ?? []).map(batch => {
    const items = batch.recipes?.recipe_items ?? []
    return {
      batchId: batch.id,
      recipeName: batch.recipes?.name ?? 'Unbekanntes Rezept',
      mealType: batch.meal_type,
      portions: batch.portions,
      ingredients: items.map(i => {
        const base = toBaseUnit(i.amount_per_portion, i.unit)
        return {
          food_name: i.food_name,
          perPortion: base.amount,
          total: Math.round(base.amount * batch.portions * 100) / 100,
          unit: base.unit,
        }
      }),
      costPerPortion: batch.cost_per_portion,
      costTotal: Math.round(batch.cost_per_portion * batch.portions * 100) / 100,
    }
  })
}
