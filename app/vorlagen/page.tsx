'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calcNutrition, sumItems } from '@/lib/calculations'

const MEAL_TYPE_LABELS: Record<string, string> = {
  fruehstueck: 'Frühstück',
  mittagessen: 'Mittagessen',
  abendessen:  'Abendessen',
  snack:       'Snack',
}
const MEAL_TYPE_ORDER = ['fruehstueck', 'mittagessen', 'abendessen', 'snack']

interface Food {
  id: string
  name: string
  calories_per_100: number
  protein_per_100: number
  cost_per_100: number
  unit: 'g' | 'ml'
}

interface TemplateItem {
  id: string
  amount: number
  unit: string
  foods: Food
}

interface Template {
  id: string
  name: string
  meal_type: string
  meal_template_items: TemplateItem[]
}

export default function VorlagenPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('meal_templates')
      .select('*, meal_template_items(*, foods(*))')
      .order('name')
    setTemplates((data as Template[]) || [])
    setLoading(false)
  }

  async function remove(id: string) {
    if (!confirm('Vorlage wirklich löschen?')) return
    await supabase.from('meal_templates').delete().eq('id', id)
    await load()
  }

  const grouped = MEAL_TYPE_ORDER.reduce<Record<string, Template[]>>((acc, type) => {
    acc[type] = templates.filter(t => t.meal_type === type)
    return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold" style={{ color: '#1e293b' }}>Vorlagen</h1>
        <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>Vorlagen werden beim Hinzufügen einer Mahlzeit gespeichert.</p>
      </div>

      {loading && <div className="text-center py-10 text-sm" style={{ color: '#64748b' }}>Laden…</div>}

      {!loading && templates.length === 0 && (
        <div
          className="p-10 text-center text-sm rounded-2xl"
          style={{ background: 'white', border: '1px solid #f1f5f9', color: '#94a3b8', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          Noch keine Vorlagen vorhanden.<br />
          <span className="text-xs">Beim Hinzufügen einer Mahlzeit kannst du sie als Vorlage speichern.</span>
        </div>
      )}

      {!loading && MEAL_TYPE_ORDER.map(type => {
        const list = grouped[type]
        if (!list.length) return null
        return (
          <div key={type} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>
              {MEAL_TYPE_LABELS[type]}
            </h2>
            <div className="space-y-3">
              {list.map(template => {
                const items = template.meal_template_items || []
                const totals = sumItems(
                  items.map(ti => calcNutrition(ti.foods, ti.amount, ti.unit))
                )
                return (
                  <div
                    key={template.id}
                    className="p-5 rounded-2xl"
                    style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="font-semibold text-sm" style={{ color: '#1e293b' }}>{template.name}</span>
                      <button
                        onClick={() => remove(template.id)}
                        className="text-xs ml-4 transition-colors"
                        style={{ color: '#dc2626' }}
                        onMouseEnter={e => ((e.target as HTMLElement).style.color = '#b91c1c')}
                        onMouseLeave={e => ((e.target as HTMLElement).style.color = '#dc2626')}
                      >
                        Löschen
                      </button>
                    </div>
                    {/* Items */}
                    <div className="space-y-1 mb-3">
                      {items.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span style={{ color: '#94a3b8' }}>
                            {item.foods?.name}
                            <span className="ml-1.5" style={{ color: '#64748b' }}>{item.amount}{item.unit}</span>
                          </span>
                          <div className="flex gap-3" style={{ color: '#64748b' }}>
                            <span>{calcNutrition(item.foods, item.amount, item.unit).kcal} kcal</span>
                            <span>{calcNutrition(item.foods, item.amount, item.unit).protein}g P</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Totals */}
                    {items.length > 0 && (
                      <div
                        className="pt-2.5 flex gap-4 text-xs font-medium"
                        style={{ borderTop: '1px solid #f1f5f9', color: '#64748b' }}
                      >
                        <span>{Math.round(totals.kcal)} kcal</span>
                        <span>{totals.protein}g Protein</span>
                        <span>CHF {totals.cost.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
