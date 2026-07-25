import { supabase, rows } from './client'
import { getMondayOfWeek, toDateStr } from '@/lib/dates'
import type { MealPlan } from './types'

export interface WeekBucket {
  /** Montag der Woche. */
  start: string
  label: string
  days: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  cost: number
}

export interface DayPoint {
  date: string
  kcal: number
  protein: number
  cost: number
  /** Tag hatte vorgekochte Boxen. */
  isPrep: boolean
  isFree: boolean
}

/**
 * Tagesreihe der letzten `weeks` Wochen, angereichert um die Information,
 * ob es ein Meal-Prep-Tag oder ein freier Tag war.
 */
export async function getDaySeries(weeks: number): Promise<DayPoint[]> {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - weeks * 7)
  const fromStr = toDateStr(from)
  const toStr = toDateStr(to)

  const [plans, portions, markers] = await Promise.all([
    rows<MealPlan>(
      await supabase.from('meal_plans')
        .select('id, date, kcal_total, protein_total, carbs_total, fat_total, cost_total, created_at')
        .gte('date', fromStr).lte('date', toStr).order('date'),
      'Tagespläne laden'
    ),
    rows<{ date: string }>(
      await supabase.from('batch_portions').select('date').gte('date', fromStr).lte('date', toStr),
      'Boxen laden'
    ),
    rows<{ date: string; is_free: boolean }>(
      await supabase.from('day_markers').select('date, is_free').gte('date', fromStr).lte('date', toStr),
      'Tagesmarker laden'
    ),
  ])

  const prepDates = new Set(portions.map(p => p.date))
  const freeDates = new Set(markers.filter(m => m.is_free).map(m => m.date))

  return plans.map(p => ({
    date: p.date,
    kcal: Number(p.kcal_total),
    protein: Number(p.protein_total),
    cost: Number(p.cost_total),
    isPrep: prepDates.has(p.date),
    isFree: freeDates.has(p.date),
  }))
}

/** Fasst die Tagesreihe zu Wochen zusammen. Leere Tage zählen nicht mit. */
export function toWeekBuckets(days: DayPoint[]): WeekBucket[] {
  const map = new Map<string, DayPoint[]>()
  for (const d of days) {
    if (d.kcal <= 0) continue
    const monday = toDateStr(getMondayOfWeek(new Date(`${d.date}T12:00:00`)))
    const list = map.get(monday) ?? []
    list.push(d)
    map.set(monday, list)
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, list]) => ({
      start,
      label: new Date(`${start}T12:00:00`).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' }),
      days: list.length,
      kcal:    round1(avg(list.map(d => d.kcal))),
      protein: round1(avg(list.map(d => d.protein))),
      carbs:   0,
      fat:     0,
      cost:    round2(list.reduce((s, d) => s + d.cost, 0)),
    }))
}

/** Meistverwendete Rezepte der letzten 90 Tage (als Topf gekocht). */
export async function topRecipes(limit = 8): Promise<Array<{ name: string; count: number }>> {
  const from = new Date()
  from.setDate(from.getDate() - 90)

  const data = rows<{ portions: number; recipes: { name: string } | null }>(
    await supabase.from('prep_batches')
      .select('portions, recipes(name), prep_cycles!inner(cook_date)')
      .gte('prep_cycles.cook_date', toDateStr(from)),
    'Rezept-Nutzung laden'
  )

  const counts = new Map<string, number>()
  for (const b of data) {
    const name = b.recipes?.name
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/** Meistverwendete Lebensmittel der letzten 90 Tage. */
export async function topFoods(limit = 8): Promise<Array<{ name: string; count: number }>> {
  const from = new Date()
  from.setDate(from.getDate() - 90)

  const data = rows<{ food_name: string }>(
    await supabase.from('meal_items')
      .select('food_name, meals!inner(plan_id, meal_plans!inner(date))')
      .gte('meals.meal_plans.date', toDateStr(from)),
    'Lebensmittel-Nutzung laden'
  )

  const counts = new Map<string, number>()
  for (const i of data) counts.set(i.food_name, (counts.get(i.food_name) ?? 0) + 1)
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}
function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }
