'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sumItems } from '@/lib/calculations'
import { loadSettings, goalColor, limitColor } from '@/lib/settings'
import { useSwipe } from '@/lib/useSwipe'
import MealModal from '@/components/MealModal'

const MEAL_TYPES = [
  { key: 'fruehstueck', label: 'Frühstück',   color: '#78716c', bg: '#fafaf9', border: '#e7e5e4' },
  { key: 'mittagessen', label: 'Mittagessen',  color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  { key: 'abendessen',  label: 'Abendessen',   color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  { key: 'snack',       label: 'Snack',        color: '#71717a', bg: '#fafafa', border: '#e4e4e7' },
]

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const DAY_LONG  = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }

interface MealItem { id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }
interface Meal     { id: string; meal_type: string; name: string; kcal_total: number; protein_total: number; cost_total: number; meal_items: MealItem[] }
interface Plan     { id: string; kcal_total: number; protein_total: number; cost_total: number }
interface WeekPlan { date: string; kcal_total: number; protein_total: number; cost_total: number }

export default function TagPage() {
  const { datum } = useParams<{ datum: string }>()
  const router = useRouter()

  const [view, setView]           = useState<'tag' | 'woche'>('tag')

  // Persist view across week navigation via URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('view') === 'woche') setView('woche')
  }, [])
  const [plan, setPlan]           = useState<Plan | null>(null)
  const [meals, setMeals]         = useState<Meal[]>([])
  const [weekPlans, setWeekPlans] = useState<WeekPlan[]>([])
  const [loading, setLoading]     = useState(true)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [goals, setGoals]         = useState({ kcal: 2000, protein: 150, kosten: 20 })
  const [editingItemId, setEditingItemId]       = useState<string | null>(null)
  const [editingItemAmount, setEditingItemAmount] = useState('')
  const [savingTemplate, setSavingTemplate] = useState<'day' | 'week' | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)

  const dateObj       = new Date(datum + 'T12:00:00')
  const todayStr      = toDateStr(new Date())
  const formattedDate = `${DAY_LONG[dateObj.getDay()]}, ${dateObj.getDate()}. ${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getFullYear()}`

  function getWeekDays(d: Date) {
    const day = d.getDay(), diff = day === 0 ? -6 : 1 - day
    return Array.from({ length: 7 }, (_, i) => { const wd = new Date(d); wd.setDate(d.getDate() + diff + i); return wd })
  }
  const weekDays = getWeekDays(dateObj)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [planRes, settingsData] = await Promise.all([
      supabase.from('meal_plans').select('*').eq('date', datum).maybeSingle(),
      loadSettings(),
    ])
    setGoals({ kcal: parseInt(settingsData.kcal_ziel) || 2000, protein: parseInt(settingsData.protein_ziel) || 150, kosten: parseInt(settingsData.kosten_ziel) || 20 })
    if (planRes.data) {
      setPlan(planRes.data)
      const { data } = await supabase.from('meals').select('*, meal_items(*)').eq('plan_id', planRes.data.id).order('created_at')
      setMeals((data as Meal[]) || [])
    } else { setPlan(null); setMeals([]) }
    setLoading(false)
  }, [datum])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (view !== 'woche') return
    const start = toDateStr(weekDays[0]), end = toDateStr(weekDays[6])
    supabase.from('meal_plans').select('date,kcal_total,protein_total,cost_total').gte('date', start).lte('date', end)
      .then(({ data }) => setWeekPlans(data || []))
  }, [view, datum])

  async function recalc(planId: string, updated: Meal[]) {
    const t = sumItems(updated.map(m => ({ kcal: m.kcal_total, protein: m.protein_total, cost: m.cost_total })))
    await supabase.from('meal_plans').update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost }).eq('id', planId)
  }

  async function handleSave({ mealName, items, totals, saveAsTemplate, templateName, mealType }: {
    mealName: string; items: { food_id: string | null; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number; isCustom?: boolean }[];
    totals: { kcal: number; protein: number; cost: number }; saveAsTemplate: boolean; templateName: string; mealType: string
  }) {
    let cur = plan
    if (!cur) {
      const { data } = await supabase.from('meal_plans').insert({ date: datum, kcal_total: 0, protein_total: 0, cost_total: 0 }).select().single()
      cur = data
    }
    const { data: meal } = await supabase.from('meals').insert({ plan_id: cur!.id, meal_type: mealType, name: mealName, kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost }).select().single()
    await supabase.from('meal_items').insert(items.map(item => ({
      meal_id: meal.id, food_id: item.food_id, food_name: item.food_name,
      amount: item.amount, unit: item.unit, kcal: item.kcal, protein: item.protein, cost: item.cost,
    })))
    if (saveAsTemplate && templateName) {
      const tmplType = (mealType === 'mittagessen' || mealType === 'abendessen') ? 'hauptmahlzeit' : mealType
      const { data: tmpl } = await supabase.from('meal_templates').insert({ name: templateName, meal_type: tmplType }).select().single()
      const templateItems = items.filter(item => item.food_id != null)
      if (templateItems.length > 0) {
        await supabase.from('meal_template_items').insert(templateItems.map(item => ({ template_id: tmpl.id, food_id: item.food_id, amount: item.amount, unit: item.unit })))
      }
    }
    await recalc(cur!.id, [...meals, { kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost } as Meal])
    setAddingFor(null); await loadData()
  }

  async function deleteMeal(id: string) {
    await supabase.from('meals').delete().eq('id', id)
    const rem = meals.filter(m => m.id !== id)
    if (plan) await recalc(plan.id, rem)
    await loadData()
  }

  async function deleteItem(meal: Meal, itemId: string) {
    await supabase.from('meal_items').delete().eq('id', itemId)
    const remainingItems = meal.meal_items.filter(i => i.id !== itemId)
    const mealTotals = remainingItems.reduce(
      (acc, i) => ({ kcal: acc.kcal + i.kcal, protein: acc.protein + i.protein, cost: acc.cost + i.cost }),
      { kcal: 0, protein: 0, cost: 0 }
    )
    await supabase.from('meals').update({
      kcal_total: mealTotals.kcal,
      protein_total: mealTotals.protein,
      cost_total: mealTotals.cost,
    }).eq('id', meal.id)
    const updatedMeals = meals.map(m =>
      m.id === meal.id
        ? { ...m, kcal_total: mealTotals.kcal, protein_total: mealTotals.protein, cost_total: mealTotals.cost }
        : m
    )
    if (plan) await recalc(plan.id, updatedMeals)
    await loadData()
  }

  async function updateItemAmount(meal: Meal, item: MealItem, newAmt: number) {
    setEditingItemId(null)
    if (newAmt <= 0 || newAmt === item.amount) return
    const ratio = newAmt / item.amount
    const newKcal    = Math.round(item.kcal    * ratio * 100)  / 100
    const newProtein = Math.round(item.protein * ratio * 1000) / 1000
    const newCost    = Math.round(item.cost    * ratio * 10000) / 10000
    await supabase.from('meal_items').update({ amount: newAmt, kcal: newKcal, protein: newProtein, cost: newCost }).eq('id', item.id)
    const newItems = meal.meal_items.map(i =>
      i.id === item.id ? { ...i, amount: newAmt, kcal: newKcal, protein: newProtein, cost: newCost } : i
    )
    const mealTotals = newItems.reduce(
      (acc, i) => ({ kcal: acc.kcal + i.kcal, protein: acc.protein + i.protein, cost: acc.cost + i.cost }),
      { kcal: 0, protein: 0, cost: 0 }
    )
    await supabase.from('meals').update({ kcal_total: mealTotals.kcal, protein_total: mealTotals.protein, cost_total: mealTotals.cost }).eq('id', meal.id)
    const updatedMeals = meals.map(m =>
      m.id === meal.id ? { ...m, kcal_total: mealTotals.kcal, protein_total: mealTotals.protein, cost_total: mealTotals.cost } : m
    )
    if (plan) await recalc(plan.id, updatedMeals)
    await loadData()
  }

  function navDay(offset: number) {
    const step = view === 'woche' ? offset * 7 : offset
    const d = new Date(datum + 'T12:00:00'); d.setDate(d.getDate() + step)
    const viewParam = view === 'woche' ? '?view=woche' : ''
    router.push(`/tag/${toDateStr(d)}${viewParam}`)
  }

  useSwipe({
    onSwipeLeft:  () => navDay(1),
    onSwipeRight: () => navDay(-1),
  })

  const [hideEmpty, setHideEmpty] = useState(false)

  const totals = sumItems(meals.map(m => ({ kcal: m.kcal_total, protein: m.protein_total, cost: m.cost_total })))

  const REQUIRED_MEALS = ['fruehstueck', 'mittagessen', 'abendessen', 'snack']
  const mealTypesPresent = new Set(meals.map(m => m.meal_type))
  const isDayComplete = REQUIRED_MEALS.every(t => mealTypesPresent.has(t))

  async function saveDayAsTemplate(name: string) {
    if (!name.trim() || !plan) return
    setTemplateSaving(true)
    const { data: template } = await supabase.from('plan_templates').insert({ name: name.trim(), type: 'day' }).select().single()
    if (!template) { setTemplateSaving(false); return }
    const { data: templateDay } = await supabase.from('plan_template_days').insert({ template_id: template.id, day_offset: 0 }).select().single()
    if (!templateDay) { setTemplateSaving(false); return }
    for (const meal of meals) {
      const { data: tmplMeal } = await supabase.from('plan_template_meals').insert({
        template_day_id: templateDay.id, meal_type: meal.meal_type, name: meal.name
      }).select().single()
      if (tmplMeal && meal.meal_items?.length) {
        await supabase.from('plan_template_items').insert(
          meal.meal_items.map(i => ({
            template_meal_id: tmplMeal.id, food_id: null, food_name: i.food_name,
            amount: i.amount, unit: i.unit, kcal: i.kcal, protein: i.protein, cost: i.cost,
          }))
        )
      }
    }
    setTemplateSaving(false); setSavingTemplate(null); setTemplateName('')
  }

  async function saveWeekAsTemplate(name: string) {
    if (!name.trim()) return
    setTemplateSaving(true)
    const { data: template } = await supabase.from('plan_templates').insert({ name: name.trim(), type: 'week' }).select().single()
    if (!template) { setTemplateSaving(false); return }
    for (let i = 0; i < weekDays.length; i++) {
      const dayStr = toDateStr(weekDays[i])
      const { data: dayPlan } = await supabase.from('meal_plans').select('id').eq('date', dayStr).maybeSingle()
      if (!dayPlan) continue
      const { data: dayMeals } = await supabase.from('meals').select('*, meal_items(*)').eq('plan_id', dayPlan.id)
      if (!dayMeals?.length) continue
      const { data: templateDay } = await supabase.from('plan_template_days').insert({ template_id: template.id, day_offset: i }).select().single()
      if (!templateDay) continue
      for (const meal of dayMeals) {
        const { data: tmplMeal } = await supabase.from('plan_template_meals').insert({
          template_day_id: templateDay.id, meal_type: meal.meal_type, name: meal.name
        }).select().single()
        if (tmplMeal && meal.meal_items?.length) {
          await supabase.from('plan_template_items').insert(
            meal.meal_items.map((mi: MealItem) => ({
              template_meal_id: tmplMeal.id, food_id: null, food_name: mi.food_name,
              amount: mi.amount, unit: mi.unit, kcal: mi.kcal, protein: mi.protein, cost: mi.cost,
            }))
          )
        }
      }
    }
    setTemplateSaving(false); setSavingTemplate(null); setTemplateName('')
  }

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => navDay(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
          style={{ color: '#64748b', background: '#f1f5f9' }}>←</button>
        <div className="text-center">
          <h1 className="text-sm font-bold" style={{ color: '#1e293b' }}>{formattedDate}</h1>
          {datum === todayStr ? (
            <span className="text-xs font-semibold" style={{ color: '#475569' }}>Heute</span>
          ) : (
            <button onClick={() => router.push(`/tag/${todayStr}`)}
              className="text-xs font-semibold px-2 py-0.5 rounded-md transition-all"
              style={{ color: '#4f46e5', background: '#eef2ff' }}>
              ↩ Heute
            </button>
          )}
        </div>
        <button onClick={() => navDay(1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
          style={{ color: '#64748b', background: '#f1f5f9' }}>→</button>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-5"
        style={{ background: '#f1f5f9' }}>
        {(['tag', 'woche'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="flex-1 py-2 text-xs rounded-lg font-semibold transition-all"
            style={view === v ? { background: 'white', color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: '#94a3b8' }}>
            {v === 'tag' ? 'Tagesplan' : 'Wochenübersicht'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: '#94a3b8' }}>Laden…</div>
      ) : view === 'woche' ? (
        // ── Week view ─────────────────────────────────────────
        <div>
          {/* Weekly summary */}
          {weekPlans.length > 0 && (() => {
            const filled = weekPlans.filter(p => p.kcal_total > 0)
            const wKcal = filled.reduce((s, p) => s + p.kcal_total, 0)
            const wProtein = filled.reduce((s, p) => s + p.protein_total, 0)
            const wCost = filled.reduce((s, p) => s + p.cost_total, 0)
            const avgKcal = filled.length > 0 ? wKcal / filled.length : 0
            return (
              <div className="rounded-2xl p-4 mb-4"
                style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>
                  Woche · {filled.length} von 7 Tagen geplant
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Ø Kalorien/Tag', v: Math.round(avgKcal), unit: 'kcal', max: goals.kcal, color: limitColor(avgKcal, goals.kcal) },
                    { label: 'Protein gesamt', v: Math.round(wProtein * 10) / 10, unit: 'g', max: 0, color: '#475569' },
                    { label: 'Kosten gesamt', v: wCost.toFixed(2), unit: 'CHF', max: 0, color: '#475569', pre: true },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="text-lg font-black" style={{ color: s.color }}>
                        {s.pre ? s.v : s.v}
                        <span className="text-xs font-normal ml-0.5" style={{ color: '#94a3b8' }}>{s.unit}</span>
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Day rows */}
          <div className="space-y-2">
            {weekDays.map((wd, i) => {
              const ds = toDateStr(wd), wp = weekPlans.find(p => p.date === ds)
              const hasData = wp && wp.kcal_total > 0
              const isActive = ds === datum, isToday = ds === todayStr
              const pct = hasData ? Math.min((wp.kcal_total / goals.kcal) * 100, 100) : 0
              const barColor = hasData ? limitColor(wp.kcal_total, goals.kcal) : '#e2e8f0'
              return (
                <button key={i} onClick={() => { router.push(`/tag/${ds}`); setView('tag') }}
                  className="w-full rounded-xl transition-all text-left overflow-hidden"
                  style={{
                    background: isActive ? '#eef2ff' : 'white',
                    border: isActive ? '1.5px solid #c7d2fe' : '1px solid #f1f5f9',
                    boxShadow: isActive ? 'none' : '0 1px 2px rgba(0,0,0,0.04)',
                  }}>
                  <div className="flex items-center gap-4 px-4 py-3">
                    {/* Day label */}
                    <div className="w-24 shrink-0">
                      <span className="text-sm font-bold" style={{ color: isToday ? '#475569' : '#1e293b' }}>
                        {DAY_LONG[i]}
                      </span>
                      <span className="text-xs block mt-0.5" style={{ color: '#94a3b8' }}>
                        {wd.getDate()}. {MONTH_NAMES[wd.getMonth()].slice(0, 3)}.
                      </span>
                    </div>
                    {hasData ? (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-bold" style={{ color: limitColor(wp.kcal_total, goals.kcal) }}>
                            {Math.round(wp.kcal_total)} kcal
                          </span>
                          <div className="flex gap-3 text-xs" style={{ color: '#64748b' }}>
                            <span>{Math.round(wp.protein_total * 10) / 10}g P</span>
                            <span style={{ color: '#94a3b8' }}>CHF {Number(wp.cost_total).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: '#f1f5f9' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                            {Math.round(pct)}% des Ziels
                          </span>
                          <span className="text-[10px]" style={{ color: '#94a3b8' }}>
                            Ziel: {goals.kcal} kcal
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <span className="text-xs" style={{ color: '#cbd5e1' }}>Nicht geplant</span>
                        <div className="h-1.5 rounded-full mt-2" style={{ background: '#f1f5f9' }} />
                      </div>
                    )}
                    <div className="shrink-0 w-5 text-center text-xs" style={{ color: '#c7d2fe' }}>›</div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Save week as template (when all 7 days have data) */}
          {weekPlans.filter(p => p.kcal_total > 0).length === 7 && (
            <div className="flex items-center justify-between rounded-2xl px-5 py-3 mt-4"
              style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}>
              <div>
                <span className="text-sm font-bold" style={{ color: '#4f46e5' }}>✓ Woche vollständig</span>
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Alle 7 Tage geplant</p>
              </div>
              <button onClick={() => setSavingTemplate('week')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                style={{ background: '#4f46e5' }}>
                💾 Als Wochenplan speichern
              </button>
            </div>
          )}
        </div>
      ) : (
        // ── Day view ──────────────────────────────────────────
        <>
          {/* Daily summary */}
          {meals.length > 0 && (
            <div className="rounded-2xl p-5 mb-5" style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Kalorien', v: Math.round(totals.kcal),               max: goals.kcal,    display: `${Math.round(totals.kcal)}`, unit: 'kcal', limit: true },
                  { label: 'Protein',  v: totals.protein,                         max: goals.protein, display: `${Math.round(totals.protein * 10) / 10}`, unit: 'g', limit: false },
                  { label: 'Kosten',   v: totals.cost,                            max: goals.kosten,  display: totals.cost.toFixed(2), unit: 'CHF', pre: true, limit: true },
                ].map(s => {
                  const color = s.limit ? limitColor(s.v, s.max) : goalColor(s.v, s.max)
                  return (
                  <div key={s.label} className="text-center">
                    <p className="text-2xl font-black" style={{ color }}>
                      {s.pre ? `${s.display}` : s.display}
                      <span className="text-sm font-normal ml-0.5" style={{ color: '#94a3b8' }}>
                        {s.unit}
                      </span>
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{s.label}</p>
                    {s.max > 0 && (
                      <p className="text-xs mt-0.5 font-semibold" style={{ color }}>
                        {Math.round((s.v / s.max) * 100)}%
                      </p>
                    )}
                  </div>
                )})}
              </div>
            </div>
          )}

          {/* Fertig geplant indicator + save as template */}
          {isDayComplete && (
            <div className="flex items-center justify-between rounded-2xl px-5 py-3 mb-3"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: '#16a34a' }}>✓ Fertig geplant</span>
              </div>
              <button onClick={() => setSavingTemplate('day')}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{ background: 'white', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
                💾 Als Vorlage speichern
              </button>
            </div>
          )}

          {/* Meal sections */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Mahlzeiten</span>
            <button onClick={() => setHideEmpty(!hideEmpty)}
              className="text-xs px-2 py-0.5 rounded-md transition-all"
              style={{ color: hideEmpty ? '#4f46e5' : '#94a3b8', background: hideEmpty ? '#eef2ff' : 'transparent' }}>
              {hideEmpty ? 'Alle anzeigen' : 'Leere ausblenden'}
            </button>
          </div>
          <div className="space-y-3">
            {MEAL_TYPES.map(({ key, label, color, bg, border }) => {
              const sectionMeals = meals.filter(m => m.meal_type === key)
              if (hideEmpty && sectionMeals.length === 0) return null
              return (
                <div key={key} className="rounded-2xl overflow-hidden"
                  style={{ border: `1px solid ${border}` }}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3.5" style={{ background: bg }}>
                    <span className="text-sm font-bold" style={{ color }}>{label}</span>
                    <button onClick={() => setAddingFor(key)}
                      className="text-xs font-bold px-3 py-1 rounded-lg transition-all"
                      style={{ background: 'white', color, border: `1px solid ${border}` }}>
                      + Hinzufügen
                    </button>
                  </div>

                  {/* Content */}
                  <div style={{ background: 'white' }}>
                    {sectionMeals.length === 0 && (
                      <p className="px-5 py-3.5 text-xs" style={{ color: '#cbd5e1' }}>Noch nichts geplant</p>
                    )}
                    {sectionMeals.map(meal => (
                      <div key={meal.id} className="px-5 py-4" style={{ borderBottom: '1px solid #f8fafc' }}>
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{meal.name}</span>
                          <button onClick={() => deleteMeal(meal.id)}
                            className="text-xs transition-all" style={{ color: '#94a3b8' }}>Entfernen</button>
                        </div>
                        <div className="space-y-1.5">
                          {meal.meal_items?.map(item => (
                            <div key={item.id} className="flex items-center justify-between group">
                              <span className="text-xs" style={{ color: '#64748b' }}>
                                {item.food_name}
                                {editingItemId === item.id ? (
                                  <input
                                    autoFocus
                                    type="number"
                                    min="0.1"
                                    step="any"
                                    value={editingItemAmount}
                                    onChange={e => setEditingItemAmount(e.target.value)}
                                    onBlur={() => updateItemAmount(meal, item, parseFloat(editingItemAmount) || item.amount)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') updateItemAmount(meal, item, parseFloat(editingItemAmount) || item.amount)
                                      if (e.key === 'Escape') setEditingItemId(null)
                                    }}
                                    className="ml-1.5 w-16 text-xs rounded px-1 py-0.5"
                                    style={{ border: '1px solid #c7d2fe', color: '#4f46e5', background: '#eef2ff', outline: 'none' }}
                                  />
                                ) : (
                                  <span
                                    className="ml-1.5 cursor-pointer rounded px-1 py-0.5 transition-colors"
                                    style={{ color: '#94a3b8' }}
                                    title="Menge bearbeiten"
                                    onClick={() => { setEditingItemId(item.id); setEditingItemAmount(String(item.amount)) }}
                                  >{item.amount}{item.unit}</span>
                                )}
                              </span>
                              <div className="flex gap-3 items-center text-xs" style={{ color: '#94a3b8' }}>
                                <span>{item.kcal} kcal</span>
                                <span>{item.protein}g P</span>
                                <span>CHF {Number(item.cost).toFixed(2)}</span>
                                <button
                                  onClick={() => deleteItem(meal, item.id)}
                                  className="text-sm leading-none opacity-30 hover:opacity-100 transition-opacity ml-1"
                                  style={{ color: '#dc2626' }}
                                  title="Zutat entfernen"
                                >×</button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-4 mt-2.5 pt-2.5 text-xs font-bold"
                          style={{ borderTop: '1px solid #f1f5f9', color: '#64748b' }}>
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
        </>
      )}

      {addingFor && (
        <MealModal mealType={addingFor} onClose={() => setAddingFor(null)} onSave={handleSave} />
      )}

      {/* Save Template Modal */}
      {savingTemplate && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>
                {savingTemplate === 'day' ? 'Tagesvorlage speichern' : 'Wochenplan speichern'}
              </h3>
              <button onClick={() => { setSavingTemplate(null); setTemplateName('') }} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg" style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs" style={{ color: '#64748b' }}>
                {savingTemplate === 'day'
                  ? `Alle Mahlzeiten von ${formattedDate} werden gespeichert.`
                  : `Alle 7 Tage der aktuellen Woche werden als Wochenplan gespeichert.`}
              </p>
              <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
                placeholder="Name der Vorlage" autoFocus
                onKeyDown={e => e.key === 'Enter' && (savingTemplate === 'day' ? saveDayAsTemplate(templateName) : saveWeekAsTemplate(templateName))}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => { setSavingTemplate(null); setTemplateName('') }} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
              <button onClick={() => savingTemplate === 'day' ? saveDayAsTemplate(templateName) : saveWeekAsTemplate(templateName)}
                disabled={!templateName.trim() || templateSaving}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: '#4f46e5' }}>{templateSaving ? 'Speichern…' : 'Speichern'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
