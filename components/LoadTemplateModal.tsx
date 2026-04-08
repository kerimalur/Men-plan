'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toDateStr } from '@/lib/dates'
import { MEAL_TYPE_LABELS } from '@/lib/mealTypes'
import { calcNutrition, sumItems } from '@/lib/calculations'

interface PlanTemplate {
  id: string; name: string; type: 'day' | 'week'; created_at: string
  plan_template_days: {
    id: string; day_offset: number
    plan_template_meals: {
      id: string; meal_type: string; name: string
      plan_template_items: { id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }[]
    }[]
  }[]
}

interface MealTemplate {
  id: string; name: string; meal_type: string
  meal_template_items: {
    id: string; amount: number; unit: string
    foods: { id: string; name: string; calories_per_100: number; protein_per_100: number; cost_per_100: number; unit: string }
  }[]
}

const SLOT_LABELS: Record<string, string> = {
  fruehstueck: 'Frühstück',
  hauptmahlzeit: 'Hauptmahlzeit',
  snack: 'Snack',
}

function defaultSlot(mealType: string): string {
  if (mealType === 'fruehstueck') return 'fruehstueck'
  if (mealType === 'snack') return 'snack'
  return 'hauptmahlzeit'
}

export default function LoadTemplateModal({ dateStr, onClose, onLoaded }: {
  dateStr: string; onClose: () => void; onLoaded: () => void
}) {
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)
  const [tab, setTab] = useState<'meal' | 'day' | 'week'>('meal')
  const [mealSlots, setMealSlots] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      supabase.from('plan_templates')
        .select('*, plan_template_days(*, plan_template_meals(*, plan_template_items(*)))')
        .order('created_at', { ascending: false }),
      supabase.from('meal_templates')
        .select('*, meal_template_items(*, foods(*))')
        .order('name'),
    ]).then(([planRes, mealRes]) => {
      setTemplates((planRes.data as PlanTemplate[]) || [])
      const mt = (mealRes.data as MealTemplate[]) || []
      setMealTemplates(mt)
      const slots: Record<string, string> = {}
      mt.forEach(t => { slots[t.id] = defaultSlot(t.meal_type) })
      setMealSlots(slots)
      setLoading(false)
    })
  }, [])

  async function applyMealTemplate(template: MealTemplate) {
    setApplying(template.id)
    const targetSlot = mealSlots[template.id] || defaultSlot(template.meal_type)

    let planId: string
    const { data: existing } = await supabase.from('meal_plans').select('id').eq('date', dateStr).maybeSingle()
    if (existing) {
      planId = existing.id
    } else {
      const { data: created } = await supabase.from('meal_plans').insert({ date: dateStr, kcal_total: 0, protein_total: 0, cost_total: 0 }).select().single()
      planId = created!.id
    }

    const items = template.meal_template_items || []
    const mealItems = items.map(ti => {
      const n = calcNutrition(ti.foods, ti.amount, ti.unit)
      return { food_id: ti.foods.id, food_name: ti.foods.name, amount: ti.amount, unit: ti.unit, kcal: n.kcal, protein: n.protein, cost: n.cost }
    })
    const totals = sumItems(mealItems.map(i => ({ kcal: i.kcal, protein: i.protein, cost: i.cost })))

    const { data: newMeal } = await supabase.from('meals').insert({
      plan_id: planId, meal_type: targetSlot, name: template.name,
      kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost,
    }).select().single()

    if (newMeal && mealItems.length) {
      await supabase.from('meal_items').insert(mealItems.map(i => ({ meal_id: newMeal.id, ...i })))
    }

    const { data: allMeals } = await supabase.from('meals').select('kcal_total,protein_total,cost_total').eq('plan_id', planId)
    const t = (allMeals || []).reduce((acc, m) => ({
      kcal: acc.kcal + Number(m.kcal_total), protein: acc.protein + Number(m.protein_total), cost: acc.cost + Number(m.cost_total)
    }), { kcal: 0, protein: 0, cost: 0 })
    await supabase.from('meal_plans').update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost }).eq('id', planId)

    setApplying(null); onLoaded()
  }

  async function apply(template: PlanTemplate) {
    setApplying(template.id)
    for (const day of template.plan_template_days || []) {
      const dateObj = new Date(dateStr + 'T12:00:00')
      dateObj.setDate(dateObj.getDate() + day.day_offset)
      const dayStr = toDateStr(dateObj)

      let planId: string
      const { data: existing } = await supabase.from('meal_plans').select('id').eq('date', dayStr).maybeSingle()
      if (existing) {
        planId = existing.id
      } else {
        const { data: created } = await supabase.from('meal_plans').insert({ date: dayStr, kcal_total: 0, protein_total: 0, cost_total: 0 }).select().single()
        planId = created!.id
      }

      for (const meal of day.plan_template_meals || []) {
        const items = meal.plan_template_items || []
        const totals = items.reduce((acc, i) => ({
          kcal: acc.kcal + Number(i.kcal), protein: acc.protein + Number(i.protein), cost: acc.cost + Number(i.cost)
        }), { kcal: 0, protein: 0, cost: 0 })

        const { data: newMeal } = await supabase.from('meals').insert({
          plan_id: planId, meal_type: meal.meal_type, name: meal.name,
          kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost
        }).select().single()

        if (newMeal && items.length) {
          await supabase.from('meal_items').insert(items.map(i => ({
            meal_id: newMeal.id, food_id: null, food_name: i.food_name,
            amount: i.amount, unit: i.unit, kcal: i.kcal, protein: i.protein, cost: i.cost
          })))
        }
      }

      const { data: allMeals } = await supabase.from('meals').select('kcal_total,protein_total,cost_total').eq('plan_id', planId)
      const t = (allMeals || []).reduce((acc, m) => ({
        kcal: acc.kcal + Number(m.kcal_total), protein: acc.protein + Number(m.protein_total), cost: acc.cost + Number(m.cost_total)
      }), { kcal: 0, protein: 0, cost: 0 })
      await supabase.from('meal_plans').update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost }).eq('id', planId)
    }
    setApplying(null); onLoaded()
  }

  const dayTemplates = templates.filter(t => t.type === 'day')
  const weekTemplates = templates.filter(t => t.type === 'week')
  const targetLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl overflow-hidden shadow-xl" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Vorlage laden</h3>
            <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
              {tab === 'week' ? `Ab ${targetLabel} (7 Tage)` : `Für ${targetLabel}`}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg" style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>

        <div className="flex gap-1 p-1 mx-5 mt-3 rounded-xl" style={{ background: '#f1f5f9' }}>
          {([
            ['meal', 'Mahlzeiten', mealTemplates.length] as const,
            ['day',  'Tagesplan',  dayTemplates.length] as const,
            ['week', 'Wochenplan', weekTemplates.length] as const,
          ]).map(([key, label, count]) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-2 text-xs rounded-lg font-semibold transition-all"
              style={tab === key ? { background: 'white', color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: '#94a3b8' }}>
              {label} ({count})
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && <p className="text-center text-sm py-8" style={{ color: '#94a3b8' }}>Laden…</p>}

          {!loading && tab === 'meal' && (
            mealTemplates.length === 0
              ? <p className="text-center text-sm py-8" style={{ color: '#94a3b8' }}>Keine Mahlzeit-Vorlagen vorhanden.</p>
              : mealTemplates.map(tmpl => {
                  const items = tmpl.meal_template_items || []
                  const totals = sumItems(items.map(ti => calcNutrition(ti.foods, ti.amount, ti.unit)))
                  const slot = mealSlots[tmpl.id] || defaultSlot(tmpl.meal_type)
                  return (
                    <div key={tmpl.id} className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{tmpl.name}</span>
                          <div className="flex gap-3 mt-1 text-xs" style={{ color: '#64748b' }}>
                            <span>{Math.round(totals.kcal)} kcal</span>
                            <span>{totals.protein}g P</span>
                            <span>{items.length} Zutaten</span>
                          </div>
                        </div>
                        <button onClick={() => applyMealTemplate(tmpl)} disabled={applying !== null}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40 ml-3"
                          style={{ background: '#16a34a' }}>
                          {applying === tmpl.id ? 'Laden…' : 'Anwenden'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs" style={{ color: '#94a3b8' }}>Als:</span>
                        <select value={slot}
                          onChange={e => setMealSlots(prev => ({ ...prev, [tmpl.id]: e.target.value }))}
                          className="text-xs rounded-lg px-2 py-1 outline-none"
                          style={{ border: '1px solid #e2e8f0', color: '#475569', background: 'white' }}>
                          {Object.entries(SLOT_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                })
          )}

          {!loading && tab === 'day' && (
            dayTemplates.length === 0
              ? <p className="text-center text-sm py-8" style={{ color: '#94a3b8' }}>Keine Tagesvorlagen vorhanden.</p>
              : dayTemplates.map(tmpl => {
                  const allMeals = tmpl.plan_template_days.flatMap(d => d.plan_template_meals || [])
                  const allItems = allMeals.flatMap(m => m.plan_template_items || [])
                  const totalKcal = allItems.reduce((s, i) => s + Number(i.kcal), 0)
                  const totalProtein = allItems.reduce((s, i) => s + Number(i.protein), 0)
                  return (
                    <div key={tmpl.id} className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{tmpl.name}</span>
                          <div className="flex gap-3 mt-1 text-xs" style={{ color: '#64748b' }}>
                            <span>{Math.round(totalKcal)} kcal</span>
                            <span>{Math.round(totalProtein * 10) / 10}g P</span>
                            <span>{allMeals.length} Mahlzeiten</span>
                          </div>
                        </div>
                        <button onClick={() => apply(tmpl)} disabled={applying !== null}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                          style={{ background: '#16a34a' }}>
                          {applying === tmpl.id ? 'Laden…' : 'Anwenden'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {allMeals.map(m => (
                          <span key={m.id} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#e2e8f0', color: '#475569' }}>
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })
          )}

          {!loading && tab === 'week' && (
            weekTemplates.length === 0
              ? <p className="text-center text-sm py-8" style={{ color: '#94a3b8' }}>Keine Wochenvorlagen vorhanden.</p>
              : weekTemplates.map(tmpl => {
                  const allMeals = tmpl.plan_template_days.flatMap(d => d.plan_template_meals || [])
                  const allItems = allMeals.flatMap(m => m.plan_template_items || [])
                  const totalKcal = allItems.reduce((s, i) => s + Number(i.kcal), 0)
                  const totalProtein = allItems.reduce((s, i) => s + Number(i.protein), 0)
                  const daysCount = tmpl.plan_template_days.length
                  return (
                    <div key={tmpl.id} className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{tmpl.name}</span>
                          <div className="flex gap-3 mt-1 text-xs" style={{ color: '#64748b' }}>
                            <span>{Math.round(totalKcal)} kcal</span>
                            <span>{Math.round(totalProtein * 10) / 10}g P</span>
                            <span>{daysCount} Tage</span>
                            <span>{allMeals.length} Mahlzeiten</span>
                          </div>
                        </div>
                        <button onClick={() => apply(tmpl)} disabled={applying !== null}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                          style={{ background: '#16a34a' }}>
                          {applying === tmpl.id ? 'Laden…' : 'Anwenden'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {allMeals.map(m => (
                          <span key={m.id} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#e2e8f0', color: '#475569' }}>
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })
          )}
        </div>
      </div>
    </div>
  )
}
