'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { loadSettings, goalColor, goalTextClass } from '@/lib/settings'

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

const MEAL_ORDER = ['fruehstueck', 'mittagessen', 'abendessen', 'snack']
const MEAL_LABELS: Record<string, string> = {
  fruehstueck: 'Frühstück', mittagessen: 'Mittagessen',
  abendessen: 'Abendessen', snack: 'Snack',
}
const MEAL_COLORS: Record<string, { text: string; dot: string }> = {
  fruehstueck: { text: 'text-amber-600',   dot: 'bg-amber-400' },
  mittagessen: { text: 'text-emerald-600', dot: 'bg-emerald-400' },
  abendessen:  { text: 'text-blue-600',    dot: 'bg-blue-400' },
  snack:       { text: 'text-violet-600',  dot: 'bg-violet-400' },
}

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 17) return 'Guten Tag'
  return 'Guten Abend'
}

function ProgressRing({ value, max }: { value: number; max: number }) {
  const size = 100
  const r = 38
  const circ = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1.1) : 0
  const color = goalColor(value, max)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="9" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="9"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - Math.min(pct, 1))}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s ease, stroke 0.3s ease' }}
      />
    </svg>
  )
}

interface Meal {
  id: string; meal_type: string; name: string
  kcal_total: number; protein_total: number; cost_total: number
}
interface Plan {
  id: string; kcal_total: number; protein_total: number; cost_total: number
}
interface DayMarker {
  training: boolean; eingeladen: boolean
}

export default function Dashboard() {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const todayLabel = `${DAY_NAMES[today.getDay()]}, ${today.getDate()}. ${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`

  const [plan, setPlan] = useState<Plan | null>(null)
  const [meals, setMeals] = useState<Meal[]>([])
  const [marker, setMarker] = useState<DayMarker | null>(null)
  const [goals, setGoals] = useState({ kcal: 2000, protein: 150, kosten: 20 })

  useEffect(() => {
    async function load() {
      const [planRes, settingsData, markerRes] = await Promise.all([
        supabase.from('meal_plans').select('*').eq('date', todayStr).maybeSingle(),
        loadSettings(),
        supabase.from('day_markers').select('training, eingeladen').eq('date', todayStr).maybeSingle(),
      ])
      setGoals({
        kcal:    parseInt(settingsData.kcal_ziel)    || 2000,
        protein: parseInt(settingsData.protein_ziel) || 150,
        kosten:  parseInt(settingsData.kosten_ziel)  || 20,
      })
      setMarker(markerRes.data)
      if (planRes.data) {
        setPlan(planRes.data)
        const { data } = await supabase.from('meals').select('*').eq('plan_id', planRes.data.id)
        setMeals(data || [])
      }
    }
    load()
  }, [])

  const kcal    = plan?.kcal_total    || 0
  const protein = plan?.protein_total || 0
  const cost    = plan?.cost_total    || 0

  const stats = [
    { label: 'Kalorien', value: Math.round(kcal),    max: goals.kcal,    display: `${Math.round(kcal)}`,              sub: `/ ${goals.kcal} kcal` },
    { label: 'Protein',  value: protein,              max: goals.protein, display: `${Math.round(protein * 10) / 10}g`, sub: `/ ${goals.protein}g` },
    { label: 'Kosten',   value: cost,                 max: goals.kosten,  display: `CHF ${cost.toFixed(2)}`,            sub: `/ CHF ${goals.kosten}` },
  ]

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="mb-7">
        <p className="text-sm text-gray-400 font-medium mb-1">{greeting()}</p>
        <h1 className="text-2xl font-bold text-gray-900">{todayLabel}</h1>
        {(marker?.training || marker?.eingeladen) && (
          <div className="flex gap-2 mt-2">
            {marker.training   && <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">Training</span>}
            {marker.eingeladen && <span className="text-xs bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-medium">Eingeladen</span>}
          </div>
        )}
      </div>

      {/* Progress rings */}
      <div className="grid grid-cols-3 gap-3 mb-7">
        {stats.map(stat => {
          const pct = stat.max > 0 ? Math.round((stat.value / stat.max) * 100) : 0
          const tc  = goalTextClass(stat.value, stat.max)
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col items-center shadow-sm">
              <div className="relative mb-2">
                <ProgressRing value={stat.value} max={stat.max} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-sm font-bold ${tc}`}>{pct}%</span>
                </div>
              </div>
              <p className={`text-base font-bold ${tc}`}>{stat.display}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
              <p className="text-xs font-semibold text-gray-500 mt-1">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Today's plan */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Heutiger Menüplan</h2>
          <Link href={`/tag/${todayStr}`} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            Bearbeiten →
          </Link>
        </div>

        {meals.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-400 mb-4">Noch nichts für heute geplant.</p>
            <Link href={`/tag/${todayStr}`}
              className="inline-block bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              Jetzt planen
            </Link>
          </div>
        ) : (
          MEAL_ORDER.map(type => {
            const meal = meals.find(m => m.meal_type === type)
            const c = MEAL_COLORS[type]
            return (
              <div key={type} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 last:border-b-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                <span className={`text-xs font-semibold w-20 shrink-0 ${c.text}`}>{MEAL_LABELS[type]}</span>
                {meal ? (
                  <>
                    <span className="text-sm text-gray-800 flex-1 truncate">{meal.name}</span>
                    <div className="flex gap-3 text-xs text-gray-400 shrink-0">
                      <span className={goalTextClass(meal.kcal_total, 0)}>{Math.round(meal.kcal_total)} kcal</span>
                      <span>{meal.protein_total}g P</span>
                      <span>CHF {Number(meal.cost_total).toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-gray-300">Nicht geplant</span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        <Link href="/kalender"
          className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm">
          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Wochenplanung
        </Link>
        <Link href="/einkaufsliste"
          className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm">
          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Einkaufsliste
        </Link>
      </div>
    </div>
  )
}
