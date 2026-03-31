'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sumItems } from '@/lib/calculations'
import { loadSettings, goalColor, goalTextClass } from '@/lib/settings'
import MealModal from '@/components/MealModal'

const MEAL_TYPES = [
  { key: 'fruehstueck', label: 'Frühstück',   gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', glow: 'rgba(245,158,11,0.15)' },
  { key: 'mittagessen', label: 'Mittagessen',  gradient: 'linear-gradient(135deg,#10b981,#0d9488)', glow: 'rgba(16,185,129,0.12)' },
  { key: 'abendessen',  label: 'Abendessen',   gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)', glow: 'rgba(59,130,246,0.12)' },
  { key: 'snack',       label: 'Snack',        gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', glow: 'rgba(139,92,246,0.12)' },
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
  const [plan, setPlan]           = useState<Plan | null>(null)
  const [meals, setMeals]         = useState<Meal[]>([])
  const [weekPlans, setWeekPlans] = useState<WeekPlan[]>([])
  const [loading, setLoading]     = useState(true)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [goals, setGoals]         = useState({ kcal: 2000, protein: 150 })

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
    setGoals({ kcal: parseInt(settingsData.kcal_ziel) || 2000, protein: parseInt(settingsData.protein_ziel) || 150 })
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
    mealName: string; items: { food_id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }[];
    totals: { kcal: number; protein: number; cost: number }; saveAsTemplate: boolean; templateName: string; mealType: string
  }) {
    let cur = plan
    if (!cur) {
      const { data } = await supabase.from('meal_plans').insert({ date: datum, kcal_total: 0, protein_total: 0, cost_total: 0 }).select().single()
      cur = data
    }
    const { data: meal } = await supabase.from('meals').insert({ plan_id: cur!.id, meal_type: mealType, name: mealName, kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost }).select().single()
    await supabase.from('meal_items').insert(items.map(item => ({ meal_id: meal.id, ...item })))
    if (saveAsTemplate && templateName) {
      const { data: tmpl } = await supabase.from('meal_templates').insert({ name: templateName, meal_type: mealType }).select().single()
      await supabase.from('meal_template_items').insert(items.map(item => ({ template_id: tmpl.id, food_id: item.food_id, amount: item.amount, unit: item.unit })))
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

  function navDay(offset: number) {
    const d = new Date(datum + 'T12:00:00'); d.setDate(d.getDate() + offset)
    router.push(`/tag/${toDateStr(d)}`)
  }

  const totals = sumItems(meals.map(m => ({ kcal: m.kcal_total, protein: m.protein_total, cost: m.cost_total })))

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => navDay(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
          style={{ color: '#64748b', background: 'rgba(255,255,255,0.05)' }}>←</button>
        <div className="text-center">
          <h1 className="text-sm font-bold text-white">{formattedDate}</h1>
          {datum === todayStr && <span className="text-xs font-semibold" style={{ color: '#6366f1' }}>Heute</span>}
        </div>
        <button onClick={() => navDay(1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-all"
          style={{ color: '#64748b', background: 'rgba(255,255,255,0.05)' }}>→</button>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-5"
        style={{ background: 'rgba(255,255,255,0.05)' }}>
        {(['tag', 'woche'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="flex-1 py-2 text-xs rounded-lg font-semibold transition-all"
            style={view === v ? { background: '#1e293b', color: '#e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' } : { color: '#475569' }}>
            {v === 'tag' ? 'Tagesplan' : 'Wochenübersicht'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm" style={{ color: '#475569' }}>Laden…</div>
      ) : view === 'woche' ? (
        // ── Week view ─────────────────────────────────────────
        <div className="space-y-2">
          {weekDays.map((wd, i) => {
            const ds = toDateStr(wd), wp = weekPlans.find(p => p.date === ds)
            const isActive = ds === datum, isToday = ds === todayStr
            return (
              <button key={i} onClick={() => { router.push(`/tag/${ds}`); setView('tag') }}
                className="w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all text-left"
                style={{
                  background: isActive ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                  border: isActive ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)',
                }}>
                <div className="w-20 shrink-0">
                  <span className="text-sm font-bold" style={{ color: isToday ? '#818cf8' : '#94a3b8' }}>
                    {DAY_SHORT[i]}
                  </span>
                  <span className="text-xs ml-2" style={{ color: '#475569' }}>
                    {wd.getDate()}. {MONTH_NAMES[wd.getMonth()].slice(0, 3)}.
                  </span>
                </div>
                {wp ? (
                  <>
                    <div className="flex gap-4 flex-1">
                      <span className="text-sm font-bold" style={{ color: goalColor(wp.kcal_total, goals.kcal) }}>
                        {Math.round(wp.kcal_total)} kcal
                      </span>
                      <span className="text-sm" style={{ color: goalColor(wp.protein_total, goals.protein) }}>
                        {wp.protein_total}g P
                      </span>
                      <span className="text-sm" style={{ color: '#475569' }}>
                        CHF {Number(wp.cost_total).toFixed(2)}
                      </span>
                    </div>
                    <div className="w-20 shrink-0">
                      <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min((wp.kcal_total / goals.kcal) * 100, 100)}%`,
                          background: goalColor(wp.kcal_total, goals.kcal),
                        }} />
                      </div>
                    </div>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: '#334155' }}>Nicht geplant</span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        // ── Day view ──────────────────────────────────────────
        <>
          {/* Daily summary */}
          {meals.length > 0 && (
            <div className="rounded-2xl p-5 mb-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Kalorien', v: Math.round(totals.kcal),               max: goals.kcal,    display: `${Math.round(totals.kcal)}`, unit: 'kcal' },
                  { label: 'Protein',  v: totals.protein,                         max: goals.protein, display: `${Math.round(totals.protein * 10) / 10}`, unit: 'g' },
                  { label: 'Kosten',   v: totals.cost,                            max: 0,             display: totals.cost.toFixed(2), unit: 'CHF', pre: true },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-2xl font-black" style={{ color: goalColor(s.v, s.max) }}>
                      {s.pre ? `${s.display}` : s.display}
                      <span className="text-sm font-normal ml-0.5" style={{ color: '#475569' }}>
                        {s.unit}
                      </span>
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{s.label}</p>
                    {s.max > 0 && (
                      <p className="text-xs mt-0.5 font-semibold" style={{ color: goalColor(s.v, s.max) }}>
                        {Math.round((s.v / s.max) * 100)}%
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meal sections */}
          <div className="space-y-3">
            {MEAL_TYPES.map(({ key, label, gradient, glow }) => {
              const sectionMeals = meals.filter(m => m.meal_type === key)
              return (
                <div key={key} className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  {/* Gradient header */}
                  <div className="flex items-center justify-between px-5 py-3.5" style={{ background: gradient }}>
                    <span className="text-sm font-bold text-white drop-shadow-sm">{label}</span>
                    <button onClick={() => setAddingFor(key)}
                      className="text-xs font-bold text-white px-3 py-1 rounded-lg transition-all"
                      style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}>
                      + Hinzufügen
                    </button>
                  </div>

                  {/* Content */}
                  <div style={{ background: glow }}>
                    {sectionMeals.length === 0 && (
                      <p className="px-5 py-3.5 text-xs" style={{ color: '#334155' }}>Noch nichts geplant</p>
                    )}
                    {sectionMeals.map(meal => (
                      <div key={meal.id} className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-sm font-bold text-white">{meal.name}</span>
                          <button onClick={() => deleteMeal(meal.id)}
                            className="text-xs transition-all" style={{ color: '#475569' }}>Entfernen</button>
                        </div>
                        <div className="space-y-1.5">
                          {meal.meal_items?.map(item => (
                            <div key={item.id} className="flex items-center justify-between">
                              <span className="text-xs" style={{ color: '#94a3b8' }}>
                                {item.food_name}
                                <span className="ml-1.5" style={{ color: '#475569' }}>{item.amount}{item.unit}</span>
                              </span>
                              <div className="flex gap-3 text-xs" style={{ color: '#64748b' }}>
                                <span>{item.kcal} kcal</span>
                                <span>{item.protein}g P</span>
                                <span>CHF {Number(item.cost).toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-4 mt-2.5 pt-2.5 text-xs font-bold"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#94a3b8' }}>
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
    </div>
  )
}
