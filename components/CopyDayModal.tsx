'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function CopyDayModal({ sourceDate, onClose, onCopied }: {
  sourceDate: string; onClose: () => void; onCopied: () => void
}) {
  const [targetDate, setTargetDate] = useState('')
  const [copying, setCopying] = useState(false)

  async function copy() {
    if (!targetDate || targetDate === sourceDate) return
    setCopying(true)

    const { data: sourcePlan } = await supabase.from('meal_plans').select('id').eq('date', sourceDate).single()
    if (!sourcePlan) { setCopying(false); return }
    const { data: meals } = await supabase.from('meals').select('*, meal_items(*)').eq('plan_id', sourcePlan.id)
    if (!meals?.length) { setCopying(false); return }

    let targetPlanId: string
    const { data: existing } = await supabase.from('meal_plans').select('id').eq('date', targetDate).maybeSingle()
    if (existing) {
      targetPlanId = existing.id
    } else {
      const { data: created } = await supabase.from('meal_plans').insert({ date: targetDate, kcal_total: 0, protein_total: 0, cost_total: 0 }).select().single()
      targetPlanId = created!.id
    }

    for (const meal of meals) {
      const { data: newMeal } = await supabase.from('meals').insert({
        plan_id: targetPlanId, meal_type: meal.meal_type, name: meal.name,
        kcal_total: meal.kcal_total, protein_total: meal.protein_total, cost_total: meal.cost_total
      }).select().single()
      if (newMeal && meal.meal_items?.length) {
        await supabase.from('meal_items').insert(
          meal.meal_items.map((i: { food_id: string | null; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }) => ({
            meal_id: newMeal.id, food_id: i.food_id, food_name: i.food_name,
            amount: i.amount, unit: i.unit, kcal: i.kcal, protein: i.protein, cost: i.cost
          }))
        )
      }
    }

    const { data: allMeals } = await supabase.from('meals').select('kcal_total,protein_total,cost_total').eq('plan_id', targetPlanId)
    const t = (allMeals || []).reduce((acc, m) => ({
      kcal: acc.kcal + Number(m.kcal_total), protein: acc.protein + Number(m.protein_total), cost: acc.cost + Number(m.cost_total)
    }), { kcal: 0, protein: 0, cost: 0 })
    await supabase.from('meal_plans').update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost }).eq('id', targetPlanId)

    setCopying(false); onCopied()
  }

  const sourceLabel = new Date(sourceDate + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Tag kopieren</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg" style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs" style={{ color: '#64748b' }}>
            Alle Mahlzeiten vom <span className="font-semibold">{sourceLabel}</span> werden kopiert nach:
          </p>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={copy} disabled={!targetDate || targetDate === sourceDate || copying}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#d97706' }}>{copying ? 'Kopieren…' : 'Kopieren'}</button>
        </div>
      </div>
    </div>
  )
}
