'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SaveDayTemplateModal({ dateStr, onClose, onSaved }: {
  dateStr: string; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data: planData } = await supabase.from('meal_plans').select('id').eq('date', dateStr).single()
    if (!planData) { setSaving(false); return }
    const { data: meals } = await supabase.from('meals').select('*, meal_items(*)').eq('plan_id', planData.id)
    if (!meals?.length) { setSaving(false); return }

    const { data: template } = await supabase.from('plan_templates').insert({ name: name.trim(), type: 'day' }).select().single()
    if (!template) { setSaving(false); return }
    const { data: templateDay } = await supabase.from('plan_template_days').insert({ template_id: template.id, day_offset: 0 }).select().single()
    if (!templateDay) { setSaving(false); return }

    for (const meal of meals) {
      const { data: tmplMeal } = await supabase.from('plan_template_meals').insert({
        template_day_id: templateDay.id, meal_type: meal.meal_type, name: meal.name
      }).select().single()
      if (tmplMeal && meal.meal_items?.length) {
        await supabase.from('meal_items').select('*').eq('meal_id', meal.id).then(({ data: items }) => {
          if (items?.length) {
            return supabase.from('plan_template_items').insert(
              items.map((i: { food_id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }) => ({
                template_meal_id: tmplMeal.id, food_id: i.food_id, food_name: i.food_name,
                amount: i.amount, unit: i.unit, kcal: i.kcal, protein: i.protein, cost: i.cost,
              }))
            )
          }
        })
      }
    }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Tag als Vorlage speichern</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg" style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs" style={{ color: '#64748b' }}>
            Alle Mahlzeiten vom <span className="font-semibold">{new Date(dateStr + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</span> werden als Tagesvorlage gespeichert.
          </p>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name der Vorlage"
            onKeyDown={e => e.key === 'Enter' && save()}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={save} disabled={!name.trim() || saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#4f46e5' }}>{saving ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}
