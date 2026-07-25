import { supabase, rows, ok } from './db/client'
import { getFoodsByIds } from './db/foods'
import { getRecipe } from './db/recipes'
import { ensurePlan, createMeal, addMealItems } from './db/plans'
import { calcNutrition } from './calculations'
import type { MealTypeKey } from './mealTypes'
import type { EventMealRule } from './db/types'

const RULE_COLUMNS =
  'id, event_type, meal_type, recipe_id, recipes(id, name, meal_type, category_id, status, freetext, default_portions, is_favorite, created_at, updated_at)'

export async function listEventRules(): Promise<EventMealRule[]> {
  const res = await supabase.from('event_meal_rules').select(RULE_COLUMNS).order('created_at')
  return rows<EventMealRule>(res, 'Event-Regeln laden')
}

export async function addEventRule(
  eventType: 'training' | 'eingeladen',
  mealType: MealTypeKey,
  recipeId: string
): Promise<void> {
  ok(
    await supabase.from('event_meal_rules').insert({
      event_type: eventType,
      meal_type: mealType,
      recipe_id: recipeId,
    }),
    'Regel anlegen'
  )
}

export async function deleteEventRule(id: string): Promise<void> {
  ok(await supabase.from('event_meal_rules').delete().eq('id', id), 'Regel löschen')
}

/**
 * Wendet die Regeln eines Event-Typs auf einen Tag an.
 *
 * Rezept-Mengen gelten pro Portion; eine frei geplante Mahlzeit ist genau
 * eine Portion, deshalb werden sie 1:1 übernommen. Slots, die an dem Tag
 * bereits belegt sind, werden nicht überschrieben.
 */
export async function applyEventRules(
  dateStr: string,
  eventType: 'training' | 'eingeladen'
): Promise<number> {
  const rules = (await listEventRules()).filter(r => r.event_type === eventType)
  if (rules.length === 0) return 0

  const plan = await ensurePlan(dateStr)

  const existing = rows<{ meal_type: string }>(
    await supabase.from('meals').select('meal_type').eq('plan_id', plan.id),
    'Belegte Slots prüfen'
  )
  const taken = new Set(existing.map(m => m.meal_type))

  let applied = 0
  for (const rule of rules) {
    if (taken.has(rule.meal_type)) continue

    const recipe = await getRecipe(rule.recipe_id)
    if (!recipe) continue

    const items = recipe.recipe_items ?? []
    const foods = await getFoodsByIds(items.map(i => i.food_id).filter(Boolean) as string[])
    const byId = new Map(foods.map(f => [f.id, f]))

    const meal = await createMeal(plan.id, rule.meal_type, recipe.name)
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
        kcal: n.kcal,
        protein: n.protein,
        carbs: n.carbs,
        fat: n.fat,
        cost: n.cost,
      }
    }))
    applied++
  }
  return applied
}
