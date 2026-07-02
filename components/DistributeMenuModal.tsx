'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toDateStr, MONTH_NAMES, DAY_SHORT } from '@/lib/dates'
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

const MONTH_SHORT = ['Jan', 'Feb', 'MÃ¤r', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

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
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [distributing, setDistributing] = useState(false)
  const [calAnchor, setCalAnchor] = useState(new Date())

  const todayStr = toDateStr(new Date())
  const calYear = calAnchor.getFullYear()
  const calMonth = calAnchor.getMonth()

  // Monday-first calendar cells
  const firstDay = new Date(calYear, calMonth, 1)
  const lastDay = new Date(calYear, calMonth + 1, 0)
  let startOff = firstDay.getDay()
  startOff = startOff === 0 ? 6 : startOff - 1
  const calCells: (Date | null)[] = []
  for (let i = 0; i < startOff; i++) calCells.push(null)
  for (let i = 1; i <= lastDay.getDate(); i++) calCells.push(new Date(calYear, calMonth, i))

  useEffect(() => {
    supabase
      .from('grosse_menus')
      .select('id, name, num_days')
      .order('created_at', { ascending: false })
      .then(({ data }) => setMenus(data || []))
  }, [])

  const selectedMeta = menus.find(m => m.id === selectedMenuId)

  function toggleDate(ds: string) {
    setSelectedDates(prev => {
      const next = new Set(prev)
      if (next.has(ds)) next.delete(ds)
      else next.add(ds)
      return next
    })
  }

  async function distribute() {
    if (!selectedMenuId || selectedDates.size === 0) return
    setDistributing(true)
    try {
      const { data: menuData } = await supabase
        .from('grosse_menus')
        .select('*, grosse_menu_meals(*, grosse_menu_items(*))')
        .eq('id', selectedMenuId)
        .single()

      if (!menuData) throw new Error('Menu not found')
      const menu = menuData as GrossesMenuFull
      const dates = Array.from(selectedDates).sort()
      const numDays = dates.length

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
              kcal_total: Math.round(items.reduce((s, i) => s + i.kcal, 0) / numDays * 10) / 10,
              protein_total: Math.round(items.reduce((s, i) => s + i.protein, 0) / numDays * 10) / 10,
              cost_total: Math.round(items.reduce((s, i) => s + i.cost, 0) / numDays * 1000) / 1000,
            })
            .select()
            .single()

          if (newMeal && items.length > 0) {
            await supabase.from('meal_items').insert(
              items.map(item => ({
                meal_id: newMeal.id,
                food_id: item.food_id,
                food_name: item.food_name,
                amount: Math.round(item.amount / numDays * 100) / 100,
                unit: item.unit,
                kcal: Math.round(item.kcal / numDays * 10) / 10,
                protein: Math.round(item.protein / numDays * 10) / 10,
                cost: Math.round(item.cost / numDays * 1000) / 1000,
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
          (acc, m) => ({ kcal: acc.kcal + Number(m.kcal_total), protein: acc.protein + Number(m.protein_total), cost: acc.cost + Number(m.cost_total) }),
          { kcal: 0, protein: 0, cost: 0 }
        )
        await supabase.from('meal_plans').update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost }).eq('id', planId)
      }

      // Track distribution (best effort)
      const { error: _trackErr } = await supabase.from('menu_distribution_log').insert(
        dates.map(date => ({ menu_id: selectedMenuId, date }))
      )
      void _trackErr

      toast(`"${menu.name}" auf ${numDays} Tag${numDays > 1 ? 'e' : ''} verteilt`, 'success')
      onDistributed()
    } catch {
      toast('Fehler beim Verteilen', 'error')
      setDistributing(false)
    }
  }

  const sortedSelected = Array.from(selectedDates).sort()

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>GroÃŸes MenÃ¼ verteilen</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>Ã—</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Menu selector */}
          {!preselectedMenuId && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>MenÃ¼</label>
              {menus.length === 0 ? (
                <p className="text-xs" style={{ color: '#94a3b8' }}>Noch keine MenÃ¼s. Erstelle zuerst ein GroÃŸes MenÃ¼.</p>
              ) : (
                <select value={selectedMenuId} onChange={e => setSelectedMenuId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ border: '1px solid #e2e8f0', color: '#1e293b', background: 'white' }}>
                  <option value="">MenÃ¼ wÃ¤hlenâ€¦</option>
                  {menus.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.num_days} Tag{m.num_days > 1 ? 'e' : ''})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {selectedMeta && (
            <div className="px-3 py-2.5 rounded-xl flex items-center justify-between"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div>
                <p className="text-sm font-bold" style={{ color: '#166534' }}>{selectedMeta.name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
                  Geplant fÃ¼r {selectedMeta.num_days} Tag{selectedMeta.num_days > 1 ? 'e' : ''} Â· Tage anklicken zum AuswÃ¤hlen
                </p>
              </div>
              {selectedDates.size > 0 && (
                <div className="text-right shrink-0 ml-3">
                  <p className="text-lg font-bold leading-tight" style={{ color: '#059669' }}>{selectedDates.size}</p>
                  <p className="text-[10px]" style={{ color: '#16a34a' }}>Tage gewÃ¤hlt</p>
                </div>
              )}
            </div>
          )}

          {/* Multi-select calendar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium" style={{ color: '#64748b' }}>Tage auswÃ¤hlen (Mehrfach mÃ¶glich)</p>
              {selectedDates.size > 0 && (
                <button onClick={() => setSelectedDates(new Set())} className="text-xs" style={{ color: '#94a3b8' }}>Auswahl lÃ¶schen</button>
              )}
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
              {/* Month nav */}
              <div className="flex items-center justify-between px-3 py-2.5"
                style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <button onClick={() => setCalAnchor(new Date(calYear, calMonth - 1, 1))}
                  className="w-6 h-6 flex items-center justify-center rounded-lg font-bold"
                  style={{ background: '#f1f5f9', color: '#475569' }}>â€¹</button>
                <span className="text-xs font-bold" style={{ color: '#1e293b' }}>{MONTH_NAMES[calMonth]} {calYear}</span>
                <button onClick={() => setCalAnchor(new Date(calYear, calMonth + 1, 1))}
                  className="w-6 h-6 flex items-center justify-center rounded-lg font-bold"
                  style={{ background: '#f1f5f9', color: '#475569' }}>â€º</button>
              </div>
              {/* Day headers */}
              <div className="grid grid-cols-7 px-2 pt-2">
                {DAY_SHORT.map(d => (
                  <div key={d} className="text-center text-[10px] font-bold uppercase pb-1" style={{ color: '#94a3b8' }}>{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
                {calCells.map((day, i) => {
                  if (!day) return <div key={i} />
                  const ds = toDateStr(day)
                  const isSelected = selectedDates.has(ds)
                  const isToday = ds === todayStr
                  const selIdx = sortedSelected.indexOf(ds)
                  return (
                    <button key={i} onClick={() => toggleDate(ds)}
                      className="text-xs rounded-lg w-full transition-colors flex flex-col items-center justify-center py-1"
                      style={{
                        background: isSelected ? '#059669' : isToday ? '#eef2ff' : 'transparent',
                        color: isSelected ? 'white' : isToday ? '#4f46e5' : '#475569',
                        fontWeight: isSelected || isToday ? '700' : '400',
                        minHeight: '2.25rem',
                      }}>
                      <span>{day.getDate()}</span>
                      {isSelected && <span className="text-[9px] leading-none opacity-80">{selIdx + 1}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Selected days summary */}
          {sortedSelected.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>
                {sortedSelected.length} Tag{sortedSelected.length > 1 ? 'e' : ''} ausgewÃ¤hlt
                {selectedMeta && sortedSelected.length !== selectedMeta.num_days && (
                  <span style={{ color: '#f59e0b' }}> Â· MenÃ¼ war fÃ¼r {selectedMeta.num_days} Tage geplant</span>
                )}
              </p>
              <div className="space-y-1">
                {sortedSelected.slice(0, 5).map((d, i) => {
                  const dateObj = new Date(d + 'T12:00:00')
                  const dow = dateObj.getDay()
                  return (
                    <div key={d} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                      style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full shrink-0"
                          style={{ background: '#059669', color: 'white' }}>{i + 1}</span>
                        <span className="text-xs" style={{ color: '#166534' }}>
                          {DAY_SHORT[dow === 0 ? 6 : dow - 1]}, {dateObj.getDate()}. {MONTH_SHORT[dateObj.getMonth()]}
                        </span>
                      </div>
                      <button onClick={() => toggleDate(d)} className="text-xs" style={{ color: '#94a3b8' }}>Ã—</button>
                    </div>
                  )
                })}
                {sortedSelected.length > 5 && (
                  <p className="text-xs px-2" style={{ color: '#94a3b8' }}>+{sortedSelected.length - 5} weitereâ€¦</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={distribute}
            disabled={!selectedMenuId || selectedDates.size === 0 || distributing || menus.length === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#059669' }}>
            {distributing ? 'Verteilenâ€¦' : selectedDates.size > 0 ? `${selectedDates.size}Ã— Verteilen` : 'Verteilen'}
          </button>
        </div>
      </div>
    </div>
  )
}

