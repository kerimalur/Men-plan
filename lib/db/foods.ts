import { supabase, rows, row, ok } from './client'
import type { Food, FoodCategory, FoodUnit } from './types'

const FOOD_COLUMNS =
  'id, name, calories_per_100, protein_per_100, carbs_per_100, fat_per_100, ' +
  'cost_per_100, unit, category_id, calories_per_100g, protein_per_100g, created_at'

export async function listFoods(opts: { search?: string; categoryId?: string | 'none' | null } = {}): Promise<Food[]> {
  let q = supabase.from('foods').select(FOOD_COLUMNS).order('name')
  if (opts.search?.trim()) q = q.ilike('name', `%${opts.search.trim()}%`)
  if (opts.categoryId === 'none') q = q.is('category_id', null)
  else if (opts.categoryId) q = q.eq('category_id', opts.categoryId)
  return rows<Food>(await q, 'Lebensmittel laden')
}

export async function searchFoods(query: string, limit = 8): Promise<Food[]> {
  if (!query.trim()) return []
  const res = await supabase
    .from('foods').select(FOOD_COLUMNS)
    .ilike('name', `%${query.trim()}%`).order('name').limit(limit)
  return rows<Food>(res, 'Lebensmittel suchen')
}

export async function getFoodsByIds(ids: string[]): Promise<Food[]> {
  if (ids.length === 0) return []
  return rows<Food>(await supabase.from('foods').select(FOOD_COLUMNS).in('id', ids), 'Lebensmittel laden')
}

export async function createFood(input: Partial<Food> & { name: string }): Promise<Food> {
  return row<Food>(await supabase.from('foods').insert(input).select(FOOD_COLUMNS).single(), 'Lebensmittel anlegen')
}

export async function updateFood(id: string, patch: Partial<Food>): Promise<void> {
  ok(await supabase.from('foods').update(patch).eq('id', id), 'Lebensmittel speichern')
}

export async function deleteFood(id: string): Promise<void> {
  ok(await supabase.from('foods').delete().eq('id', id), 'Lebensmittel löschen')
}

export interface FoodImportRow {
  name: string
  calories_per_100: number
  protein_per_100: number
  carbs_per_100?: number
  fat_per_100?: number
  cost_per_100: number
  unit: FoodUnit
}

/**
 * Zeilenweiser Import. Gleiche Namen werden aktualisiert statt dupliziert —
 * `foods.name` trägt einen UNIQUE-Index.
 */
export async function importFoods(rowsToImport: FoodImportRow[]): Promise<number> {
  if (rowsToImport.length === 0) return 0
  ok(
    await supabase.from('foods').upsert(
      rowsToImport.map(r => ({ carbs_per_100: 0, fat_per_100: 0, ...r })),
      { onConflict: 'name' }
    ),
    'Lebensmittel importieren'
  )
  return rowsToImport.length
}

export async function listFoodCategories(): Promise<FoodCategory[]> {
  const res = await supabase.from('food_categories').select('id, name, created_at').order('name')
  return rows<FoodCategory>(res, 'Kategorien laden')
}

export async function createFoodCategory(name: string): Promise<FoodCategory> {
  const res = await supabase.from('food_categories').insert({ name }).select('id, name, created_at').single()
  return row<FoodCategory>(res, 'Kategorie anlegen')
}

export async function deleteFoodCategory(id: string): Promise<void> {
  ok(await supabase.from('food_categories').delete().eq('id', id), 'Kategorie löschen')
}

/**
 * Ranking für die Auswertung: Protein bzw. Kalorien pro Franken.
 * Lebensmittel ohne hinterlegten Preis fallen raus — sonst stünde eine
 * Division durch 0 an der Spitze.
 */
export async function foodValueRanking(metric: 'protein' | 'kcal', limit = 15): Promise<
  Array<{ id: string; name: string; value: number; cost_per_100: number }>
> {
  const foods = await listFoods()
  const column = metric === 'protein' ? 'protein_per_100' : 'calories_per_100'
  return foods
    .filter(f => f.cost_per_100 > 0)
    .map(f => ({
      id: f.id,
      name: f.name,
      cost_per_100: f.cost_per_100,
      value: Math.round((f[column] / f.cost_per_100) * 10) / 10,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}
