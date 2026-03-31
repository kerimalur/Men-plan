'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sumItems } from '@/lib/calculations'
import MealModal from '@/components/MealModal'

const MEAL_TYPES = [
  { key: 'fruehstueck', label: 'Frühstück' },
  { key: 'mittagessen', label: 'Mittagessen' },
  { key: 'abendessen',  label: 'Abendessen' },
  { key: 'snack',       label: 'Snack' },
]

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

interface MealItem {
  id: string
  food_id: string
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  cost: number
}

interface Meal {
  id: string
  meal_type: string
  name: string
  kcal_total: number
  protein_total: number
  cost_total: number
  meal_items: MealItem[]
}

interface Plan {
  id: string
  date: string
  kcal_total: number
  protein_total: number
  cost_total: number
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function TagPage() {
  const { datum } = useParams<{ datum: string }>()
  const router = useRouter()

  const [plan, setPlan]   = useState<Plan | null>(null)
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [addingFor, setAddingFor] = useState<string | null>(null)

  const dateObj = new Date(datum + 'T12:00:00')
  const formattedDate = `${DAY_NAMES[dateObj.getDay()]}, ${dateObj.getDate()}. ${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getFullYear()}`

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: planData } = await supabase
      .from('meal_plans')
      .select('*')
      .eq('date', datum)
      .maybeSingle()

    if (planData) {
      setPlan(planData)
      const { data: mealsData } = await supabase
        .from('meals')
        .select('*, meal_items(*)')
        .eq('plan_id', planData.id)
        .order('created_at')
      setMeals((mealsData as Meal[]) || [])
    } else {
      setPlan(null)
      setMeals([])
    }
    setLoading(false)
  }, [datum])

  useEffect(() => { loadData() }, [loadData])

  async function recalcPlanTotals(planId: string, updatedMeals: Meal[]) {
    const t = sumItems(updatedMeals.map(m => ({
      kcal: m.kcal_total, protein: m.protein_total, cost: m.cost_total,
    })))
    await supabase.from('meal_plans').update({
      kcal_total:    t.kcal,
      protein_total: t.protein,
      cost_total:    t.cost,
    }).eq('id', planId)
  }

  async function handleSave({ mealName, items, totals, saveAsTemplate, templateName, mealType }: {
    mealName: string
    items: { food_id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }[]
    totals: { kcal: number; protein: number; cost: number }
    saveAsTemplate: boolean
    templateName: string
    mealType: string
  }) {
    // 1. Ensure plan exists
    let currentPlan = plan
    if (!currentPlan) {
      const { data } = await supabase
        .from('meal_plans')
        .insert({ date: datum, kcal_total: 0, protein_total: 0, cost_total: 0 })
        .select()
        .single()
      currentPlan = data
    }

    // 2. Create meal
    const { data: meal } = await supabase
      .from('meals')
      .insert({
        plan_id:       currentPlan!.id,
        meal_type:     mealType,
        name:          mealName,
        kcal_total:    totals.kcal,
        protein_total: totals.protein,
        cost_total:    totals.cost,
      })
      .select()
      .single()

    // 3. Create meal items
    await supabase.from('meal_items').insert(
      items.map(item => ({
        meal_id:   meal.id,
        food_id:   item.food_id,
        food_name: item.food_name,
        amount:    item.amount,
        unit:      item.unit,
        kcal:      item.kcal,
        protein:   item.protein,
        cost:      item.cost,
      }))
    )

    // 4. Optionally save template
    if (saveAsTemplate && templateName) {
      const { data: tmpl } = await supabase
        .from('meal_templates')
        .insert({ name: templateName, meal_type: mealType })
        .select()
        .single()
      await supabase.from('meal_template_items').insert(
        items.map(item => ({
          template_id: tmpl.id,
          food_id:     item.food_id,
          amount:      item.amount,
          unit:        item.unit,
        }))
      )
    }

    // 5. Update plan totals
    const allMeals = [...meals, { kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost } as Meal]
    await recalcPlanTotals(currentPlan!.id, allMeals)

    setAddingFor(null)
    await loadData()
  }

  async function deleteMeal(mealId: string) {
    await supabase.from('meals').delete().eq('id', mealId)
    const remaining = meals.filter(m => m.id !== mealId)
    if (plan) await recalcPlanTotals(plan.id, remaining)
    await loadData()
  }

  // Navigation to prev/next day
  function navDay(offset: number) {
    const d = new Date(datum + 'T12:00:00')
    d.setDate(d.getDate() + offset)
    router.push(`/tag/${toDateStr(d)}`)
  }

  const totals = sumItems(meals.map(m => ({
    kcal: m.kcal_total, protein: m.protein_total, cost: m.cost_total,
  })))

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navDay(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:shadow-sm transition-all">
          ←
        </button>
        <h1 className="text-base font-semibold text-gray-900 text-center">{formattedDate}</h1>
        <button onClick={() => navDay(1)}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white hover:shadow-sm transition-all">
          →
        </button>
      </div>

      {/* Daily summary */}
      {meals.length > 0 && (
        <div className="grid grid-cols-3 gap-px bg-gray-200 rounded-xl overflow-hidden mb-6 shadow-sm">
          {[
            { label: 'kcal',    value: Math.round(totals.kcal).toString() },
            { label: 'Protein', value: `${totals.protein}g` },
            { label: 'Kosten',  value: `CHF ${totals.cost.toFixed(2)}` },
          ].map(stat => (
            <div key={stat.label} className="bg-white px-4 py-3 text-center">
              <p className="text-xl font-semibold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-sm text-gray-400">Laden…</div>
      )}

      {/* Meal sections */}
      {!loading && (
        <div className="space-y-4">
          {MEAL_TYPES.map(({ key, label }) => {
            const sectionMeals = meals.filter(m => m.meal_type === key)
            return (
              <div key={key} className="bg-white rounded-xl border border-gray-200">
                {/* Section header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
                  <button
                    onClick={() => setAddingFor(key)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + Hinzufügen
                  </button>
                </div>

                {/* Meals */}
                <div>
                  {sectionMeals.length === 0 && (
                    <p className="px-5 py-4 text-xs text-gray-300">Noch nichts geplant</p>
                  )}
                  {sectionMeals.map(meal => (
                    <div key={meal.id} className="px-5 py-4 border-b border-gray-50 last:border-b-0">
                      {/* Meal header */}
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-sm font-semibold text-gray-900">{meal.name}</span>
                        <button
                          onClick={() => deleteMeal(meal.id)}
                          className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                        >
                          Entfernen
                        </button>
                      </div>
                      {/* Items */}
                      <div className="space-y-1">
                        {meal.meal_items?.map(item => (
                          <div key={item.id} className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">
                              {item.food_name}
                              <span className="text-gray-400 ml-1.5">{item.amount}{item.unit}</span>
                            </span>
                            <div className="flex gap-3 text-xs text-gray-400">
                              <span>{item.kcal} kcal</span>
                              <span>{item.protein}g P</span>
                              <span>CHF {Number(item.cost).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Meal totals */}
                      <div className="flex gap-4 mt-2.5 pt-2 border-t border-gray-50 text-xs font-medium text-gray-600">
                        <span>{Math.round(meal.kcal_total)} kcal</span>
                        <span>{meal.protein_total}g Protein</span>
                        <span>CHF {Number(meal.cost_total).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {addingFor && (
        <MealModal
          mealType={addingFor}
          onClose={() => setAddingFor(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
