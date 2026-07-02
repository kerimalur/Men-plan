'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { calcNutrition } from '@/lib/calculations'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from '@/lib/mealTypes'
import { toDateStr } from '@/lib/dates'
import { useToast } from '@/components/Toast'
import type { Food } from '@/components/FoodSearch'

// ── Types ─────────────────────────────────────────────────────

interface GrossesMenuItem {
  id: string
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  cost: number
}

interface GrossesMenuMahlzeit {
  id: string
  menu_id: string
  meal_type: string
  name: string
  grosse_menu_items: GrossesMenuItem[]
}

interface GrossesMenu {
  id: string
  name: string
  num_days: number
  created_at: string
  grosse_menu_meals: GrossesMenuMahlzeit[]
}

interface EditItem {
  localId: string
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  cost: number
}

const DAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

// ── Add Meal Modal ─────────────────────────────────────────────

function AddMealModal({ menuId, onClose, onSaved }: {
  menuId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [mealType, setMealType] = useState('mittagessen')
  const [name, setName] = useState('')
  const [items, setItems] = useState<EditItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Food[]>([])
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('foods').select('*').ilike('name', `%${searchQuery}%`).order('name').limit(8)
      setSearchResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectFood(food: Food) {
    setSelectedFood(food)
    setSearchQuery(food.name)
    setSearchResults([])
    setUnit(food.unit === 'ml' ? 'ml' : food.unit === 'stk' ? 'stk' : 'g')
    setAmount('')
  }

  function addItem() {
    if (!selectedFood || !amount) return
    const nutrition = calcNutrition(selectedFood, amount, unit)
    setItems(prev => [...prev, {
      localId: Math.random().toString(36).slice(2),
      food_id: selectedFood.id,
      food_name: selectedFood.name,
      amount: parseFloat(amount),
      unit,
      kcal: nutrition.kcal,
      protein: nutrition.protein,
      cost: nutrition.cost,
    }])
    setSelectedFood(null)
    setSearchQuery('')
    setAmount('')
  }

  async function save() {
    if (!name.trim() || items.length === 0) return
    setSaving(true)
    const { data: meal } = await supabase
      .from('grosse_menu_meals')
      .insert({ menu_id: menuId, meal_type: mealType, name: name.trim() })
      .select()
      .single()
    if (meal && items.length > 0) {
      await supabase.from('grosse_menu_items').insert(
        items.map(item => ({
          menu_meal_id: meal.id,
          food_id: item.food_id,
          food_name: item.food_name,
          amount: item.amount,
          unit: item.unit,
          kcal: item.kcal,
          protein: item.protein,
          cost: item.cost,
        }))
      )
    }
    setSaving(false)
    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.75rem', padding: '0.625rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Mahlzeit hinzufügen</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Mahlzeittyp</label>
              <select value={mealType} onChange={e => setMealType(e.target.value)} style={inputStyle}>
                {MEAL_TYPE_ORDER.map(k => (
                  <option key={k} value={k}>{MEAL_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="z.B. Pasta Bolognese" style={inputStyle} />
            </div>
          </div>

          <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <p className="text-xs font-semibold" style={{ color: '#64748b' }}>
              Zutat hinzufügen
            </p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Gesamtmenge für alle Tage eingeben (z.B. 900 g Pasta für 3 Tage)
            </p>
            <div className="relative" ref={searchRef}>
              <input type="text" value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSelectedFood(null) }}
                placeholder="Lebensmittel suchen…" style={inputStyle} />
              {searchResults.length > 0 && (
                <ul className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl shadow-xl max-h-44 overflow-y-auto"
                  style={{ background: 'white', border: '1px solid #e2e8f0' }}>
                  {searchResults.map(food => (
                    <li key={food.id} onMouseDown={() => selectFood(food)}
                      className="px-3 py-2.5 text-sm cursor-pointer"
                      style={{ color: '#1e293b' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span className="font-medium">{food.name}</span>
                      <span className="text-xs ml-2" style={{ color: '#64748b' }}>{food.calories_per_100} kcal</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2">
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Menge" min="0" step="1"
                style={{ ...inputStyle, flex: 1, width: undefined }} />
              <select value={unit} onChange={e => setUnit(e.target.value)}
                style={{ background: 'white', border: '1px solid #e2e8f0', color: '#1e293b', borderRadius: '0.75rem', padding: '0.625rem 0.5rem', fontSize: '0.875rem', outline: 'none' }}>
                {selectedFood?.unit === 'ml' ? (
                  <><option value="ml">ml</option><option value="dl">dl</option><option value="l">l</option></>
                ) : selectedFood?.unit === 'stk' ? (
                  <option value="stk">Stk.</option>
                ) : <option value="g">g</option>}
              </select>
              <button onClick={addItem} disabled={!selectedFood || !amount}
                className="px-4 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: '#475569' }}>+</button>
            </div>
          </div>

          {items.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>
                Zutaten ({items.length})
              </p>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f1f5f9' }}>
                {items.map((item, i) => (
                  <div key={item.localId} className="flex items-center justify-between px-3 py-2.5"
                    style={i > 0 ? { borderTop: '1px solid #f1f5f9' } : {}}>
                    <div>
                      <span className="text-sm font-medium" style={{ color: '#1e293b' }}>{item.food_name}</span>
                      <span className="text-xs ml-2" style={{ color: '#94a3b8' }}>
                        {item.amount}{item.unit} · {item.kcal} kcal
                      </span>
                    </div>
                    <button onClick={() => setItems(prev => prev.filter(x => x.localId !== item.localId))}
                      className="text-base" style={{ color: '#94a3b8' }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={save} disabled={!name.trim() || items.length === 0 || saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#059669' }}>
            {saving ? 'Speichern…' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Load Vorlage Modal ─────────────────────────────────────────

interface MealTemplate {
  id: string
  name: string
  meal_type: string
  meal_template_items: {
    id: string
    amount: number
    unit: string
    foods: { id: string; name: string; calories_per_100: number; protein_per_100: number; cost_per_100: number; unit: string }
  }[]
}

function LoadVorlageModal({ menu, onClose, onSaved }: {
  menu: GrossesMenu
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<MealTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // per-template day multiplier, defaults to menu.num_days
  const [days, setDays] = useState<Record<string, number>>({})

  useEffect(() => {
    supabase
      .from('meal_templates')
      .select('*, meal_template_items(*, foods(*))')
      .order('name')
      .then(({ data }) => {
        const tpls = (data as MealTemplate[]) || []
        const defaults: Record<string, number> = {}
        tpls.forEach(t => { defaults[t.id] = menu.num_days })
        setDays(defaults)
        setTemplates(tpls)
        setLoading(false)
      })
  }, [menu.num_days])

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  function getDays(id: string) { return days[id] ?? menu.num_days }

  async function insertTemplate(tpl: MealTemplate) {
    const multiplier = getDays(tpl.id)
    if (multiplier < 1) return
    setSaving(tpl.id)
    try {
      const { data: meal } = await supabase
        .from('grosse_menu_meals')
        .insert({ menu_id: menu.id, meal_type: tpl.meal_type === 'hauptmahlzeit' ? 'mittagessen' : tpl.meal_type, name: tpl.name })
        .select()
        .single()

      if (meal && tpl.meal_template_items.length > 0) {
        await supabase.from('grosse_menu_items').insert(
          tpl.meal_template_items.map(item => {
            const n = calcNutrition(item.foods, item.amount * multiplier, item.unit)
            return {
              menu_meal_id: meal.id,
              food_id: item.foods.id,
              food_name: item.foods.name,
              amount: item.amount * multiplier,
              unit: item.unit,
              kcal: n.kcal,
              protein: n.protein,
              cost: n.cost,
            }
          })
        )
      }
      toast(`"${tpl.name}" eingefügt (×${multiplier} Tage)`, 'success')
      onSaved()
    } catch {
      toast('Fehler beim Einfügen', 'error')
      setSaving(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.75rem', padding: '0.625rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md max-h-[88vh] flex flex-col rounded-2xl shadow-xl overflow-hidden"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Vorlage einfügen</h3>
            <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
              Tage anpassen → Mengen werden automatisch hoch- oder runtergerechnet
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>

        <div className="px-5 pt-4 shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Vorlage suchen…"
            style={inputStyle}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-center text-xs py-8" style={{ color: '#94a3b8' }}>Laden…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs py-8" style={{ color: '#94a3b8' }}>
              {search ? 'Keine Treffer' : 'Keine Vorlagen vorhanden'}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map(tpl => {
                const multiplier = getDays(tpl.id)
                const kcalPerDay = tpl.meal_template_items.reduce((s, i) =>
                  s + calcNutrition(i.foods, i.amount, i.unit).kcal, 0)
                const kcalTotal = kcalPerDay * multiplier
                return (
                  <div key={tpl.id} className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid #e2e8f0' }}>
                    {/* Header row */}
                    <div className="flex items-center gap-3 px-3.5 py-3"
                      style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#1e293b' }}>{tpl.name}</p>
                        {kcalPerDay > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                            {Math.round(kcalPerDay)} kcal/Tag
                            {multiplier > 0 && <> → <strong style={{ color: '#059669' }}>{Math.round(kcalTotal)} kcal gesamt</strong></>}
                          </p>
                        )}
                      </div>
                      {/* Days input */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setDays(d => ({ ...d, [tpl.id]: Math.max(1, (d[tpl.id] ?? menu.num_days) - 1) }))}
                          className="w-7 h-7 rounded-lg text-base font-bold flex items-center justify-center"
                          style={{ background: '#f1f5f9', color: '#475569' }}>−</button>
                        <input
                          type="number"
                          min="1" max="30"
                          value={multiplier}
                          onChange={e => setDays(d => ({ ...d, [tpl.id]: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) }))}
                          className="w-10 text-center text-sm font-bold rounded-lg outline-none"
                          style={{ border: '1px solid #e2e8f0', color: '#1e293b', padding: '0.25rem' }}
                        />
                        <button
                          onClick={() => setDays(d => ({ ...d, [tpl.id]: Math.min(30, (d[tpl.id] ?? menu.num_days) + 1) }))}
                          className="w-7 h-7 rounded-lg text-base font-bold flex items-center justify-center"
                          style={{ background: '#f1f5f9', color: '#475569' }}>+</button>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>T</span>
                      </div>
                      <button
                        onClick={() => insertTemplate(tpl)}
                        disabled={saving === tpl.id || multiplier < 1}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                        style={{ background: '#059669' }}>
                        {saving === tpl.id ? '…' : 'Einfügen'}
                      </button>
                    </div>
                    {/* Items preview */}
                    {tpl.meal_template_items.length > 0 && (
                      <div className="px-3.5 py-2.5 space-y-1.5">
                        {tpl.meal_template_items.map(item => {
                          const scaled = item.amount * multiplier
                          const changed = multiplier !== 1
                          return (
                            <div key={item.id} className="flex items-center justify-between text-xs"
                              style={{ color: '#64748b' }}>
                              <span>{item.foods.name}</span>
                              <span>
                                <span style={{ color: '#94a3b8' }}>{item.amount}{item.unit}/Tag</span>
                                <span style={{ color: '#94a3b8' }}> × {multiplier} = </span>
                                <strong style={{ color: changed ? '#059669' : '#475569' }}>
                                  {Number.isInteger(scaled) ? scaled : Math.round(scaled * 10) / 10}{item.unit}
                                </strong>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}>Schließen</button>
        </div>
      </div>
    </div>
  )
}

// ── Distribute Modal ───────────────────────────────────────────

function DistributeModal({ menu, onClose, onDistributed }: {
  menu: GrossesMenu
  onClose: () => void
  onDistributed: () => void
}) {
  const { toast } = useToast()
  const [startDate, setStartDate] = useState(toDateStr(new Date()))
  const [distributing, setDistributing] = useState(false)

  function getPreviewDates(): string[] {
    const dates: string[] = []
    const start = new Date(startDate + 'T12:00:00')
    for (let i = 0; i < menu.num_days; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      dates.push(toDateStr(d))
    }
    return dates
  }

  async function distribute() {
    setDistributing(true)
    try {
      const dates = getPreviewDates()
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

  const previewDates = getPreviewDates()

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Menü verteilen</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-sm font-bold" style={{ color: '#166534' }}>{menu.name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
              {menu.num_days} Tage · {menu.grosse_menu_meals.length} Mahlzeit{menu.grosse_menu_meals.length !== 1 ? 'en' : ''}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Startdatum</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
          </div>

          <div>
            <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>
              Wird verteilt auf {previewDates.length} Tage
            </p>
            <div className="space-y-1.5">
              {previewDates.map((d, i) => {
                const dateObj = new Date(d + 'T12:00:00')
                return (
                  <div key={d} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                    <span className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shrink-0"
                      style={{ background: '#eef2ff', color: '#4f46e5' }}>
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
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={distribute} disabled={!startDate || distributing}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#059669' }}>
            {distributing ? 'Verteilen…' : 'Verteilen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────

export default function GrosseMenusPage() {
  const { toast } = useToast()
  const [menus, setMenus] = useState<GrossesMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDays, setNewDays] = useState(3)
  const [addingMealTo, setAddingMealTo] = useState<string | null>(null)
  const [loadingVorlageTo, setLoadingVorlageTo] = useState<GrossesMenu | null>(null)
  const [distributeMenu, setDistributeMenu] = useState<GrossesMenu | null>(null)

  useEffect(() => { loadMenus() }, [])

  async function loadMenus() {
    setLoading(true)
    const { data } = await supabase
      .from('grosse_menus')
      .select('*, grosse_menu_meals(*, grosse_menu_items(*))')
      .order('created_at', { ascending: false })
    setMenus((data as GrossesMenu[]) || [])
    setLoading(false)
  }

  async function createMenu() {
    if (!newName.trim()) return
    const { data } = await supabase
      .from('grosse_menus')
      .insert({ name: newName.trim(), num_days: newDays })
      .select()
      .single()
    if (data) {
      setNewName('')
      setNewDays(3)
      setCreating(false)
      setExpandedId(data.id)
      await loadMenus()
      toast(`"${data.name}" erstellt`, 'success')
    }
  }

  async function deleteMenu(menu: GrossesMenu) {
    if (!confirm(`"${menu.name}" wirklich löschen?`)) return
    await supabase.from('grosse_menus').delete().eq('id', menu.id)
    await loadMenus()
    toast(`"${menu.name}" gelöscht`, 'success')
  }

  async function deleteMeal(meal: GrossesMenuMahlzeit, menuName: string) {
    await supabase.from('grosse_menu_meals').delete().eq('id', meal.id)
    await loadMenus()
    toast(`"${meal.name}" entfernt`, 'success')
  }

  if (loading) {
    return <div className="text-center py-12 text-sm" style={{ color: '#94a3b8' }}>Laden…</div>
  }

  return (
    <div className="max-w-xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#1e293b' }}>Große Menüs</h1>
          <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
            Kochmengen für mehrere Tage planen und gleichmäßig verteilen
          </p>
        </div>
        <button onClick={() => setCreating(true)}
          className="text-xs font-bold px-4 py-2 rounded-xl text-white"
          style={{ background: '#059669' }}>
          + Neu
        </button>
      </div>

      {/* Info card */}
      <div className="rounded-2xl p-4 mb-5 flex items-start gap-3"
        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
        <span className="text-lg mt-0.5">💡</span>
        <p className="text-xs leading-relaxed" style={{ color: '#166534' }}>
          Erstelle ein Menü mit den Gesamtmengen (z.B. 900 g Pasta für 3 Tage). 
          Beim Verteilen rechnet die App automatisch die Tagesportion aus und 
          trägt sie in die gewählten Tage ein.
        </p>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl p-5 mb-5"
          style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: '#1e293b' }}>Neues Menü</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createMenu()}
                placeholder="z.B. Pasta Bolognese Batch"
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>
                Für wie viele Tage kochst du?
              </label>
              <div className="flex items-center gap-3">
                <input type="number" value={newDays}
                  onChange={e => setNewDays(Math.max(1, Math.min(14, parseInt(e.target.value) || 1)))}
                  min="1" max="14"
                  className="w-20 px-3 py-2.5 rounded-xl text-sm outline-none text-center font-bold"
                  style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
                <span className="text-sm" style={{ color: '#64748b' }}>Tage</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setCreating(false); setNewName('') }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
            <button onClick={createMenu} disabled={!newName.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
              style={{ background: '#059669' }}>Erstellen</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {menus.length === 0 && !creating && (
        <div className="text-center py-14 rounded-2xl"
          style={{ background: 'white', border: '1px dashed #e2e8f0' }}>
          <p className="text-3xl mb-3">🍲</p>
          <p className="text-sm font-semibold" style={{ color: '#475569' }}>Noch keine großen Menüs</p>
          <p className="text-xs mt-1 mb-5" style={{ color: '#94a3b8' }}>
            Erstelle ein Menü für mehrere Tage Meal Prep
          </p>
          <button onClick={() => setCreating(true)}
            className="text-sm font-bold px-6 py-2.5 rounded-xl text-white"
            style={{ background: '#059669' }}>
            Erstes Menü erstellen
          </button>
        </div>
      )}

      {/* Menu list */}
      <div className="space-y-4">
        {menus.map(menu => {
          const isExpanded = expandedId === menu.id
          const allItems = menu.grosse_menu_meals.flatMap(m => m.grosse_menu_items)
          const totalKcal = allItems.reduce((s, i) => s + Number(i.kcal), 0)
          const totalProtein = allItems.reduce((s, i) => s + Number(i.protein), 0)
          const perDayKcal = menu.num_days > 0 ? Math.round(totalKcal / menu.num_days) : 0
          const perDayProtein = menu.num_days > 0 ? Math.round(totalProtein / menu.num_days * 10) / 10 : 0

          return (
            <div key={menu.id} className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

              {/* Menu header */}
              <button
                className="w-full px-5 py-4 flex items-center justify-between text-left"
                style={{ background: '#f8fafc', borderBottom: isExpanded ? '1px solid #f1f5f9' : 'none' }}
                onClick={() => setExpandedId(isExpanded ? null : menu.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{menu.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                      style={{ background: '#f0fdf4', color: '#166534' }}>
                      {menu.num_days} Tage
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                    {menu.grosse_menu_meals.length} Mahlzeit{menu.grosse_menu_meals.length !== 1 ? 'en' : ''}
                    {perDayKcal > 0 ? ` · ≈ ${perDayKcal} kcal/Tag · ${perDayProtein}g P/Tag` : ' · Noch keine Zutaten'}
                  </p>
                </div>
                <span className="ml-3 shrink-0 text-lg" style={{
                  color: '#94a3b8',
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                }}>▾</span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div>
                  {menu.grosse_menu_meals.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-xs" style={{ color: '#94a3b8' }}>
                        Noch keine Mahlzeiten – füge deine erste Mahlzeit hinzu
                      </p>
                    </div>
                  ) : (
                    <div>
                      {menu.grosse_menu_meals.map((meal, mealIdx) => {
                        const mealKcal = meal.grosse_menu_items.reduce((s, i) => s + Number(i.kcal), 0)
                        const mealProtein = meal.grosse_menu_items.reduce((s, i) => s + Number(i.protein), 0)
                        const mealCost = meal.grosse_menu_items.reduce((s, i) => s + Number(i.cost), 0)
                        return (
                          <div key={meal.id} className="px-5 py-4"
                            style={mealIdx > 0 ? { borderTop: '1px solid #f8fafc' } : {}}>
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <span className="text-xs font-semibold uppercase tracking-wider"
                                  style={{ color: '#94a3b8' }}>
                                  {MEAL_TYPE_LABELS[meal.meal_type]}
                                </span>
                                <p className="text-sm font-bold mt-0.5" style={{ color: '#1e293b' }}>
                                  {meal.name}
                                </p>
                              </div>
                              <button onClick={() => deleteMeal(meal, menu.name)}
                                className="text-xs ml-3 shrink-0" style={{ color: '#94a3b8' }}>
                                Entfernen
                              </button>
                            </div>

                            {meal.grosse_menu_items.length > 0 && (
                              <div className="space-y-1 mb-3">
                                {meal.grosse_menu_items.map(item => (
                                  <div key={item.id} className="flex items-center justify-between text-xs"
                                    style={{ color: '#64748b' }}>
                                    <span>{item.food_name}</span>
                                    <span style={{ color: '#94a3b8' }}>
                                      {item.amount}{item.unit} · {item.kcal} kcal
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-2"
                              style={{ borderTop: '1px solid #f8fafc' }}>
                              <div className="flex gap-3 text-xs" style={{ color: '#64748b' }}>
                                <span className="font-bold">{Math.round(mealKcal)} kcal gesamt</span>
                                <span>{Math.round(mealProtein * 10) / 10}g P</span>
                                <span>CHF {mealCost.toFixed(2)}</span>
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded-md"
                                style={{ background: '#eef2ff', color: '#4f46e5' }}>
                                → {Math.round(mealKcal / menu.num_days)} kcal/Tag
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="px-5 py-4 flex gap-2 flex-wrap" style={{ borderTop: '1px solid #f1f5f9' }}>
                    <button onClick={() => setLoadingVorlageTo(menu)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                      style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
                      Vorlage einfügen
                    </button>
                    <button onClick={() => setAddingMealTo(menu.id)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                      style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                      + Manuell
                    </button>
                    <button
                      onClick={() => setDistributeMenu(menu)}
                      disabled={menu.grosse_menu_meals.length === 0}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                      style={{ background: '#059669' }}>
                      Verteilen
                    </button>
                    <button onClick={() => deleteMenu(menu)}
                      className="py-2.5 px-3 rounded-xl text-xs"
                      style={{ background: '#fff1f2', color: '#dc2626', border: '1px solid #fecdd3' }}>
                      Löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modals */}
      {addingMealTo && (
        <AddMealModal
          menuId={addingMealTo}
          onClose={() => setAddingMealTo(null)}
          onSaved={async () => {
            setAddingMealTo(null)
            await loadMenus()
            toast('Mahlzeit hinzugefügt', 'success')
          }}
        />
      )}

      {distributeMenu && (
        <DistributeModal
          menu={distributeMenu}
          onClose={() => setDistributeMenu(null)}
          onDistributed={() => setDistributeMenu(null)}
        />
      )}

      {loadingVorlageTo && (
        <LoadVorlageModal
          menu={loadingVorlageTo}
          onClose={() => setLoadingVorlageTo(null)}
          onSaved={async () => {
            setLoadingVorlageTo(null)
            await loadMenus()
          }}
        />
      )}
    </div>
  )
}
