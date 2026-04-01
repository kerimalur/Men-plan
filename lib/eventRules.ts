import { supabase } from './supabase'

interface EventRule {
  id: string
  event_type: string
  meal_type: string
  template_id: string
  meal_templates: {
    id: string
    name: string
    meal_type: string
    meal_template_items: {
      id: string
      amount: number
      unit: string
      foods: {
        id: string
        name: string
        calories_per_100: number
        protein_per_100: number
        cost_per_100: number
        unit: string
      }
    }[]
  }
}

function toFactor(amount: number, unit: string, baseUnit: string): number {
  if (baseUnit === 'stk') return amount
  switch (unit) {
    case 'g':  return amount / 100
    case 'ml': return amount / 100
    case 'dl': return (amount * 100) / 100
    case 'l':  return (amount * 1000) / 100
    case 'stk': return amount
    default:   return amount / 100
  }
}

export async function applyEventRules(dateStr: string, eventType: 'training' | 'eingeladen') {
  const { data: rules } = await supabase
    .from('event_meal_rules')
    .select('*, meal_templates(id, name, meal_type, meal_template_items(id, amount, unit, foods(*)))')
    .eq('event_type', eventType)

  if (!rules?.length) return

  for (const rule of rules as unknown as EventRule[]) {
    const tmpl = rule.meal_templates
    if (!tmpl) continue

    // Get or create meal_plan for this date
    let planId: string
    const { data: existing } = await supabase.from('meal_plans').select('id').eq('date', dateStr).maybeSingle()
    if (existing) {
      planId = existing.id
    } else {
      const { data: created } = await supabase.from('meal_plans')
        .insert({ date: dateStr, kcal_total: 0, protein_total: 0, cost_total: 0 })
        .select().single()
      planId = created!.id
    }

    // Check if this meal_type already has a meal from this template (avoid duplicates)
    const { data: existingMeals } = await supabase
      .from('meals')
      .select('id, name')
      .eq('plan_id', planId)
      .eq('meal_type', rule.meal_type)
      .eq('name', tmpl.name)
    if (existingMeals && existingMeals.length > 0) continue

    // Build items
    const items = (tmpl.meal_template_items || []).map(ti => {
      const food = ti.foods
      const factor = toFactor(ti.amount, ti.unit, food.unit)
      return {
        food_id: food.id,
        food_name: food.name,
        amount: ti.amount,
        unit: ti.unit,
        kcal: Math.round(food.calories_per_100 * factor * 10) / 10,
        protein: Math.round(food.protein_per_100 * factor * 10) / 10,
        cost: Math.round(food.cost_per_100 * factor * 1000) / 1000,
      }
    })

    const totals = items.reduce(
      (acc, i) => ({ kcal: acc.kcal + i.kcal, protein: acc.protein + i.protein, cost: acc.cost + i.cost }),
      { kcal: 0, protein: 0, cost: 0 }
    )

    // Insert meal
    const { data: newMeal } = await supabase.from('meals').insert({
      plan_id: planId,
      meal_type: rule.meal_type,
      name: tmpl.name,
      kcal_total: Math.round(totals.kcal * 10) / 10,
      protein_total: Math.round(totals.protein * 10) / 10,
      cost_total: Math.round(totals.cost * 1000) / 1000,
    }).select().single()

    if (newMeal && items.length) {
      await supabase.from('meal_items').insert(
        items.map(i => ({ meal_id: newMeal.id, ...i }))
      )
    }

    // Recalculate plan totals
    const { data: allMeals } = await supabase
      .from('meals')
      .select('kcal_total, protein_total, cost_total')
      .eq('plan_id', planId)
    const t = (allMeals || []).reduce(
      (acc, m) => ({
        kcal: acc.kcal + Number(m.kcal_total),
        protein: acc.protein + Number(m.protein_total),
        cost: acc.cost + Number(m.cost_total),
      }),
      { kcal: 0, protein: 0, cost: 0 }
    )
    await supabase.from('meal_plans').update({
      kcal_total: t.kcal,
      protein_total: t.protein,
      cost_total: t.cost,
    }).eq('id', planId)
  }
}
