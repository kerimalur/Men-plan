import { supabase, rows, row, maybeRow, ok } from './client'
import { calcNutrition, sumItems, type Nutrition } from '@/lib/calculations'
import type { MealTypeKey } from '@/lib/mealTypes'
import type { Food, Recipe, RecipeItem, RecipeStatus, TemplateCategory, ItemUnit } from './types'

const RECIPE_COLUMNS =
  'id, name, meal_type, category_id, status, freetext, default_portions, is_favorite, created_at, updated_at'

const WITH_ITEMS = `${RECIPE_COLUMNS}, recipe_items(id, recipe_id, food_id, food_name, amount_per_portion, unit, sort_order)`

export interface RecipeFilter {
  mealType?: MealTypeKey | null
  categoryId?: string | null
  status?: RecipeStatus | null
  favoritesOnly?: boolean
  search?: string
}

export async function listRecipes(filter: RecipeFilter = {}): Promise<Recipe[]> {
  let q = supabase.from('recipes').select(WITH_ITEMS)
  if (filter.mealType) q = q.eq('meal_type', filter.mealType)
  if (filter.categoryId) q = q.eq('category_id', filter.categoryId)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.favoritesOnly) q = q.eq('is_favorite', true)
  if (filter.search?.trim()) q = q.ilike('name', `%${filter.search.trim()}%`)
  const res = await q.order('is_favorite', { ascending: false }).order('name')
  return sortItems(rows<Recipe>(res, 'Rezepte laden'))
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const found = maybeRow<Recipe>(await supabase.from('recipes').select(WITH_ITEMS).eq('id', id).maybeSingle(), 'Rezept laden')
  return found ? sortItems([found])[0] : null
}

function sortItems(recipes: Recipe[]): Recipe[] {
  return recipes.map(r => ({
    ...r,
    recipe_items: [...(r.recipe_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export async function createRecipe(input: {
  name: string
  meal_type: MealTypeKey
  category_id?: string | null
  status?: RecipeStatus
  freetext?: string
  default_portions?: number
}): Promise<Recipe> {
  const res = await supabase.from('recipes').insert({
    name: input.name,
    meal_type: input.meal_type,
    category_id: input.category_id ?? null,
    status: input.status ?? 'bereit',
    freetext: input.freetext ?? '',
    default_portions: input.default_portions ?? 3,
  }).select(RECIPE_COLUMNS).single()
  return row<Recipe>(res, 'Rezept anlegen')
}

export async function updateRecipe(id: string, patch: Partial<Recipe>): Promise<void> {
  // recipe_items ist eine Relation, keine Spalte -- darf nicht mitgeschickt werden.
  const fields = { ...patch }
  delete fields.recipe_items
  ok(await supabase.from('recipes')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id), 'Rezept speichern')
}

export async function deleteRecipe(id: string): Promise<void> {
  ok(await supabase.from('recipes').delete().eq('id', id), 'Rezept löschen')
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
  await updateRecipe(id, { is_favorite: isFavorite })
}

/** Kopiert Rezept samt Zutaten. Name bekommt " (Kopie)". */
export async function duplicateRecipe(id: string): Promise<Recipe> {
  const source = await getRecipe(id)
  if (!source) throw new Error('Rezept duplizieren: Vorlage nicht gefunden')

  const copy = await createRecipe({
    name: `${source.name} (Kopie)`,
    meal_type: source.meal_type,
    category_id: source.category_id,
    status: source.status,
    freetext: source.freetext,
    default_portions: source.default_portions,
  })

  const items = source.recipe_items ?? []
  if (items.length > 0) {
    ok(await supabase.from('recipe_items').insert(
      items.map(i => ({
        recipe_id: copy.id,
        food_id: i.food_id,
        food_name: i.food_name,
        amount_per_portion: i.amount_per_portion,
        unit: i.unit,
        sort_order: i.sort_order,
      }))
    ), 'Rezept duplizieren')
  }
  return copy
}

// ── Zutaten ─────────────────────────────────────────────────────────────────

export async function addRecipeItem(input: {
  recipe_id: string
  food_id: string | null
  food_name: string
  amount_per_portion: number
  unit: ItemUnit
  sort_order?: number
}): Promise<RecipeItem> {
  const res = await supabase.from('recipe_items').insert({
    ...input,
    sort_order: input.sort_order ?? 0,
  }).select('id, recipe_id, food_id, food_name, amount_per_portion, unit, sort_order').single()
  return row<RecipeItem>(res, 'Zutat hinzufügen')
}

/** Inline-Bearbeitung: nur die Menge pro Portion ändern. */
export async function updateRecipeItemAmount(id: string, amountPerPortion: number): Promise<void> {
  ok(await supabase.from('recipe_items')
    .update({ amount_per_portion: amountPerPortion })
    .eq('id', id), 'Menge speichern')
}

export async function deleteRecipeItem(id: string): Promise<void> {
  ok(await supabase.from('recipe_items').delete().eq('id', id), 'Zutat löschen')
}

// ── Nährwerte ───────────────────────────────────────────────────────────────

/**
 * Nährwerte und Kosten für EINE Portion.
 *
 * Zutaten ohne verknüpftes Lebensmittel (food_id null, weil das Lebensmittel
 * gelöscht wurde) tragen 0 bei — sie zählen nicht als Fehler, erscheinen in der
 * Zutatenliste aber weiterhin unter ihrem gespeicherten Namen.
 */
export function nutritionPerPortion(items: RecipeItem[], foodsById: Map<string, Food>): Nutrition {
  return sumItems(
    items.map(item => {
      const food = item.food_id ? foodsById.get(item.food_id) : undefined
      if (!food) return { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 }
      return calcNutrition(food, item.amount_per_portion, item.unit)
    })
  )
}

/** Dieselbe Rechnung, hochgerechnet auf eine Anzahl Portionen. */
export function nutritionForPortions(items: RecipeItem[], foodsById: Map<string, Food>, portions: number): Nutrition {
  const per = nutritionPerPortion(items, foodsById)
  return {
    kcal:    Math.round(per.kcal    * portions * 10)   / 10,
    protein: Math.round(per.protein * portions * 10)   / 10,
    carbs:   Math.round(per.carbs   * portions * 10)   / 10,
    fat:     Math.round(per.fat     * portions * 10)   / 10,
    cost:    Math.round(per.cost    * portions * 1000) / 1000,
  }
}

// ── Kategorien ──────────────────────────────────────────────────────────────

export async function listRecipeCategories(): Promise<TemplateCategory[]> {
  return rows<TemplateCategory>(await supabase.from('template_categories').select('id, name').order('name'), 'Kategorien laden')
}

export async function createRecipeCategory(name: string): Promise<TemplateCategory> {
  const res = await supabase.from('template_categories').insert({ name }).select('id, name').single()
  return row<TemplateCategory>(res, 'Kategorie anlegen')
}

export async function deleteRecipeCategory(id: string): Promise<void> {
  ok(await supabase.from('template_categories').delete().eq('id', id), 'Kategorie löschen')
}
