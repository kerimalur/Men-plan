'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toDateStr } from '@/lib/dates'
import { useToast } from '@/components/Toast'

interface GrossesMenuPreview {
  id: string
  name: string
  num_days: number
}

interface GrossesMenuItemFull {
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  cost: number
}

interface GrossesMenuMahlzeitFull {
  id: string
  meal_type: string
  name: string
  grosse_menu_items: GrossesMenuItemFull[]
}

interface GrossesMenuFull extends GrossesMenuPreview {
  grosse_menu_meals: GrossesMenuMahlzeitFull[]
}

const DAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export default function DistributeMenuModal({
  preselectedMenuId,
  onClose,
  onDistributed,
}: {
  preselectedMenuId?: string
  onClose: () => void
  onDistributed: () => void
}) {
  const { toast } = useToast()
  const [menus, setMenus] = useState<GrossesMenuPreview[]>([])
  const [selectedMenuId, setSelectedMenuId] = useState(preselectedMenuId || '')
  const [startDate, setStartDate] = useState(toDateStr(new Date()))
  const [distributing, setDistributing] = useState(false)

  useEffect(() => {
    supabase
      .from('grosse_menus')
      .select('id, name, num_days')
      .order('created_at', { ascending: false })
      .then(({ data }) => setMenus(data || []))
  }, [])

  const selectedMeta = menus.find(m => m.id === selectedMenuId)

  function getPreviewDates(numDays: number): string[] {
    const dates: string[] = []
    const start = new Date(startDate + 'T12:00:00')
    for (let i = 0; i < numDays; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      dates.push(toDateStr(d))
    }
    return dates
  }

  async function distribute() {
    if (!selectedMenuId || !startDate) return
    setDistributing(true)
    try {
      const { data: menuData } = await supabase
        .from('grosse_menus')
        .select('*, grosse_menu_meals(*, grosse_menu_items(*))')
        .eq('id', selectedMenuId)
        .single()

      if (!menuData) throw new Error('Menu not found')
      const menu = menuData as GrossesMenuFull
      const dates = getPreviewDates(menu.num_days)

      for (const dateStr of dates) {
        let planId: string
        const { data: existing } = await supabase
          .from('meal_plans')
          .select('id')
          .eq('date', dateStr)
          .maybeSingle()

        if (existing) {
          planId = existing.id
        } else {
          const { data: created } = await supabase
            .from('meal_plans')
            .insert({ date: dateStr, kcal_total: 0, protein_total: 0, cost_total: 0 })
            .select()
            .single()
          planId = created!.id
        }

        for (const menuMeal of menu.grosse_menu_meals) {
          const items = menuMeal.grosse_menu_items || []
          const { data: newMeal } = await supabase
            .from('meals')
            .insert({
              plan_id: planId,
              meal_type: menuMeal.meal_type,
              name: menuMeal.name,
              kcal_total: Math.round(items.reduce((s, i) => s + i.kcal, 0) / menu.num_days * 10) / 10,
              protein_total: Math.round(items.reduce((s, i) => s + i.protein, 0) / menu.num_days * 10) / 10,
              cost_total: Math.round(items.reduce((s, i) => s + i.cost, 0) / menu.num_days * 1000) / 1000,
            })
            .select()
            .single()

          if (newMeal && items.length > 0) {
            await supabase.from('meal_items').insert(
              items.map(item => ({
                meal_id: newMeal.id,
                food_id: item.food_id,
                food_name: item.food_name,
                amount: Math.round(item.amount / menu.num_days * 100) / 100,
                unit: item.unit,
                kcal: Math.round(item.kcal / menu.num_days * 10) / 10,
                protein: Math.round(item.protein / menu.num_days * 10) / 10,
                cost: Math.round(item.cost / menu.num_days * 1000) / 1000,
              }))
            )
          }
        }

        // Recalc plan totals
        const { data: allMeals } = await supabase
          .from('meals')
          .select('kcal_total,protein_total,cost_total')
          .eq('plan_id', planId)
        const t = (allMeals || []).reduce(
          (acc, m) => ({
            kcal: acc.kcal + Number(m.kcal_total),
            protein: acc.protein + Number(m.protein_total),
            cost: acc.cost + Number(m.cost_total),
          }),
          { kcal: 0, protein: 0, cost: 0 }
        )
        await supabase
          .from('meal_plans')
          .update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost })
          .eq('id', planId)
      }

      toast(`"${menu.name}" auf ${menu.num_days} Tage verteilt`, 'success')
      onDistributed()
    } catch {
      toast('Fehler beim Verteilen', 'error')
      setDistributing(false)
    }
  }

  const previewDates = selectedMeta ? getPreviewDates(selectedMeta.num_days) : []

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}
        >
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Großes Menü verteilen</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Menu selector (hidden if pre-selected) */}
          {!preselectedMenuId && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Menü</label>
              {menus.length === 0 ? (
                <p className="text-xs" style={{ color: '#94a3b8' }}>
                  Noch keine Menüs. Erstelle zuerst ein Großes Menü.
                </p>
              ) : (
                <select
                  value={selectedMenuId}
                  onChange={e => setSelectedMenuId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid #e2e8f0', color: '#1e293b', background: 'white' }}
                >
                  <option value="">Menü wählen…</option>
                  {menus.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.num_days} Tage)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {selectedMeta && (
            <div
              className="px-3 py-2.5 rounded-xl"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}
            >
              <p className="text-sm font-bold" style={{ color: '#166534' }}>{selectedMeta.name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
                Wird auf {selectedMeta.num_days} Tage gleichmäßig aufgeteilt
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Startdatum</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ border: '1px solid #e2e8f0', color: '#1e293b' }}
            />
          </div>

          {previewDates.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>
                Wird verteilt auf {previewDates.length} Tage
              </p>
              <div className="space-y-1.5">
                {previewDates.map((d, i) => {
                  const dateObj = new Date(d + 'T12:00:00')
                  return (
                    <div
                      key={d}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}
                    >
                      <span
                        className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full"
                        style={{ background: '#eef2ff', color: '#4f46e5' }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-xs" style={{ color: '#475569' }}>
                        {DAY_SHORT[dateObj.getDay()]}, {dateObj.getDate()}. {MONTH_SHORT[dateObj.getMonth()]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}
          >
            Abbrechen
          </button>
          <button
            onClick={distribute}
            disabled={!selectedMenuId || !startDate || distributing || menus.length === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#059669' }}
          >
            {distributing ? 'Verteilen…' : 'Verteilen'}
          </button>
        </div>
      </div>
    </div>
  )
}
