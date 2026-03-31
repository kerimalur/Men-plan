'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sumItems } from '@/lib/calculations'
import { loadSettings, goalColor, goalTextClass } from '@/lib/settings'
import MealModal from '@/components/MealModal'

const MEAL_TYPES = [
  { key: 'fruehstueck', label: 'Frühstück',   color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100' },
  { key: 'mittagessen', label: 'Mittagessen',  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  { key: 'abendessen',  label: 'Abendessen',   color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-100' },
  { key: 'snack',       label: 'Snack',        color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-100' },
]

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const DAY_NAMES_LONG  = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const DAY_NAMES_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }

interface MealItem { id: string; food_id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }
interface Meal { id: string; meal_type: string; name: string; kcal_total: number; protein_total: number; cost_total: number; meal_items: MealItem[] }
interface Plan { id: string; kcal_total: number; protein_total: number; cost_total: number }
interface WeekPlan { date: string; kcal_total: number; protein_total: number; cost_total: number }

export default function TagPage() {
  const { datum } = useParams<{ datum: string }>()
  const router = useRouter()

  const [view, setView]         = useState<'tag' | 'woche'>('tag')
  const [plan, setPlan]         = useState<Plan | null>(null)
  const [meals, setMeals]       = useState<Meal[]>([])
  const [weekPlans, setWeekPlans] = useState<WeekPlan[]>([])
  const [loading, setLoading]   = useState(true)
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [goals, setGoals]       = useState({ kcal: 2000, protein: 150 })

  const dateObj     = new Date(datum + 'T12:00:00')
  const todayStr    = toDateStr(new Date())
  const formattedDate = `${DAY_NAMES_LONG[dateObj.getDay()]}, ${dateObj.getDate()}. ${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getFullYear()}`

  // Current week Mon–Sun
  function getWeekDays(d: Date): Date[] {
    const day  = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    return Array.from({ length: 7 }, (_, i) => {
      const wd = new Date(d); wd.setDate(d.getDate() + diff + i); return wd
    })
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
    } else {
      setPlan(null); setMeals([])
    }
    setLoading(false)
  }, [datum])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (view === 'woche') {
      const start = toDateStr(weekDays[0])
      const end   = toDateStr(weekDays[6])
      supabase.from('meal_plans').select('date,kcal_total,protein_total,cost_total').gte('date', start).lte('date', end)
        .then(({ data }) => setWeekPlans(data || []))
    }
  }, [view, datum])

  async function recalcPlanTotals(planId: string, updatedMeals: Meal[]) {
    const t = sumItems(updatedMeals.map(m => ({ kcal: m.kcal_total, protein: m.protein_total, cost: m.cost_total })))
    await supabase.from('meal_plans').update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost }).eq('id', planId)
  }

  async function handleSave({ mealName, items, totals, saveAsTemplate, templateName, mealType }: {
    mealName: string; items: { food_id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }[];
    totals: { kcal: number; protein: number; cost: number }; saveAsTemplate: boolean; templateName: string; mealType: string
  }) {
    let currentPlan = plan
    if (!currentPlan) {
      const { data } = await supabase.from('meal_plans').insert({ date: datum, kcal_total: 0, protein_total: 0, cost_total: 0 }).select().single()
      currentPlan = data
    }
    const { data: meal } = await supabase.from('meals').insert({
      plan_id: currentPlan!.id, meal_type: mealType, name: mealName,
      kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost,
    }).select().single()
    await supabase.from('meal_items').insert(items.map(item => ({ meal_id: meal.id, ...item })))
    if (saveAsTemplate && templateName) {
      const { data: tmpl } = await supabase.from('meal_templates').insert({ name: templateName, meal_type: mealType }).select().single()
      await supabase.from('meal_template_items').insert(items.map(item => ({ template_id: tmpl.id, food_id: item.food_id, amount: item.amount, unit: item.unit })))
    }
    const allMeals = [...meals, { kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost } as Meal]
    await recalcPlanTotals(currentPlan!.id, allMeals)
    setAddingFor(null); await loadData()
  }

  async function deleteMeal(mealId: string) {
    await supabase.from('meals').delete().eq('id', mealId)
    const remaining = meals.filter(m => m.id !== mealId)
    if (plan) await recalcPlanTotals(plan.id, remaining)
    await loadData()
  }

  function navDay(offset: number) {
    const d = new Date(datum + 'T12:00:00'); d.setDate(d.getDate() + offset)
    router.push(`/tag/${toDateStr(d)}`)
  }

  const totals = sumItems(meals.map(m => ({ kcal: m.kcal_total, protein: m.protein_total, cost: m.cost_total })))

  // ── Week view ───────────────────────────────────────────────
  function renderWeek() {
    return (
      <div className="space-y-2">
        {weekDays.map((wd, i) => {
          const ds   = toDateStr(wd)
          const wp   = weekPlans.find(p => p.date === ds)
          const isActive = ds === datum
          const isToday  = ds === todayStr
          return (
            <button key={i} onClick={() => { router.push(`/tag/${ds}`); setView('tag') }}
              className={`w-full flex items-center gap-4 px-5 py-3 rounded-xl border transition-colors text-left ${
                isActive ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="w-20 shrink-0">
                <span className={`text-sm font-semibold ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                  {DAY_NAMES_SHORT[i]}
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  {wd.getDate()}. {MONTH_NAMES[wd.getMonth()].slice(0, 3)}.
                </span>
              </div>
              {wp ? (
                <div className="flex gap-5 flex-1">
                  <span className={`text-sm font-medium ${goalTextClass(wp.kcal_total, goals.kcal)}`}>
                    {Math.round(wp.kcal_total)} kcal
                  </span>
                  <span className={`text-sm ${goalTextClass(wp.protein_total, goals.protein)}`}>
                    {wp.protein_total}g P
                  </span>
                  <span className="text-sm text-gray-500">CHF {Number(wp.cost_total).toFixed(2)}</span>
                </div>
              ) : (
                <span className="text-xs text-gray-300">Nicht geplant</span>
              )}
              {/* Progress bar */}
              {wp && (
                <div className="flex-1 max-w-[80px]">
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min((wp.kcal_total / goals.kcal) * 100, 100)}%`,
                      backgroundColor: goalColor(wp.kcal_total, goals.kcal),
                    }} />
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  // ── Day view ────────────────────────────────────────────────
  function renderDay() {
    return (
      <>
        {/* Summary */}
        {meals.length > 0 && (
          <div className="grid grid-cols-3 gap-px bg-gray-200 rounded-xl overflow-hidden mb-5 shadow-sm">
            {[
              { label: 'kcal',    value: Math.round(totals.kcal).toString(),                max: goals.kcal },
              { label: 'Protein', value: `${Math.round(totals.protein * 10) / 10}g`,        max: goals.protein },
              { label: 'Kosten',  value: `CHF ${totals.cost.toFixed(2)}`,                   max: 0 },
            ].map(s => (
              <div key={s.label} className="bg-white px-4 py-3 text-center">
                <p className={`text-xl font-bold ${goalTextClass(parseFloat(s.value), s.max)}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Meal sections */}
        <div className="space-y-3">
          {MEAL_TYPES.map(({ key, label, color, bg, border }) => {
            const sectionMeals = meals.filter(m => m.meal_type === key)
            return (
              <div key={key} className={`rounded-xl border ${border} overflow-hidden`}>
                <div className={`flex items-center justify-between px-5 py-3 ${bg} border-b ${border}`}>
                  <h2 className={`text-sm font-bold ${color}`}>{label}</h2>
                  <button onClick={() => setAddingFor(key)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium bg-white px-2.5 py-1 rounded-lg border border-indigo-100 hover:border-indigo-300 transition-colors">
                    + Hinzufügen
                  </button>
                </div>
                <div className="bg-white">
                  {sectionMeals.length === 0 && (
                    <p className="px-5 py-3 text-xs text-gray-300">Noch nichts geplant</p>
                  )}
                  {sectionMeals.map(meal => (
                    <div key={meal.id} className="px-5 py-4 border-b border-gray-50 last:border-b-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-900">{meal.name}</span>
                        <button onClick={() => deleteMeal(meal.id)} className="text-xs text-gray-300 hover:text-red-400 transition-colors">Entfernen</button>
                      </div>
                      <div className="space-y-1">
                        {meal.meal_items?.map(item => (
                          <div key={item.id} className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">
                              {item.food_name} <span className="text-gray-400">{item.amount}{item.unit}</span>
                            </span>
                            <div className="flex gap-3 text-xs text-gray-400">
                              <span>{item.kcal} kcal</span>
                              <span>{item.protein}g P</span>
                              <span>CHF {Number(item.cost).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4 mt-2 pt-2 border-t border-gray-50 text-xs font-semibold text-gray-600">
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
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => navDay(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-white hover:shadow-sm transition-all">←</button>
        <div className="text-center">
          <h1 className="text-sm font-bold text-gray-900">{formattedDate}</h1>
          {datum === todayStr && <span className="text-xs text-indigo-500 font-medium">Heute</span>}
        </div>
        <button onClick={() => navDay(1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-white hover:shadow-sm transition-all">→</button>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 mb-5">
        {(['tag', 'woche'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-1.5 text-xs rounded-lg font-medium transition-colors capitalize ${
              view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {v === 'tag' ? 'Tagesplan' : 'Wochenübersicht'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Laden…</div>
      ) : view === 'tag' ? renderDay() : renderWeek()}

      {addingFor && (
        <MealModal mealType={addingFor} onClose={() => setAddingFor(null)} onSave={handleSave} />
      )}
    </div>
  )
}
