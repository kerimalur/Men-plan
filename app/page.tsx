'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { loadSettings, goalColor, goalTextClass } from '@/lib/settings'

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

const MEAL_ORDER = ['fruehstueck', 'mittagessen', 'abendessen', 'snack']
const MEAL_META: Record<string, { label: string; gradient: string; text: string }> = {
  fruehstueck: { label: 'Frühstück',   gradient: 'linear-gradient(135deg,#f59e0b,#f97316)', text: '#fef3c7' },
  mittagessen: { label: 'Mittagessen', gradient: 'linear-gradient(135deg,#10b981,#0d9488)', text: '#d1fae5' },
  abendessen:  { label: 'Abendessen',  gradient: 'linear-gradient(135deg,#3b82f6,#6366f1)', text: '#dbeafe' },
  snack:       { label: 'Snack',       gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', text: '#ede9fe' },
}

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 17) return 'Guten Tag'
  return 'Guten Abend'
}

function ArcProgress({ value, max, size = 110 }: { value: number; max: number; size?: number }) {
  const r = size * 0.37
  const circ = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const color = goalColor(value, max)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="9"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1), stroke 0.3s ease' }}
      />
    </svg>
  )
}

interface Meal { id: string; meal_type: string; name: string; kcal_total: number; protein_total: number; cost_total: number }
interface Plan { kcal_total: number; protein_total: number; cost_total: number }
interface DayMarker { training: boolean; eingeladen: boolean }

export default function Dashboard() {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const todayLabel = `${DAY_NAMES[today.getDay()]}, ${today.getDate()}. ${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`

  const [plan, setPlan]     = useState<Plan | null>(null)
  const [meals, setMeals]   = useState<Meal[]>([])
  const [marker, setMarker] = useState<DayMarker | null>(null)
  const [goals, setGoals]   = useState({ kcal: 2000, protein: 150, kosten: 20 })

  useEffect(() => {
    async function load() {
      const [planRes, settingsData, markerRes] = await Promise.all([
        supabase.from('meal_plans').select('*').eq('date', todayStr).maybeSingle(),
        loadSettings(),
        supabase.from('day_markers').select('training,eingeladen').eq('date', todayStr).maybeSingle(),
      ])
      setGoals({ kcal: parseInt(settingsData.kcal_ziel) || 2000, protein: parseInt(settingsData.protein_ziel) || 150, kosten: parseInt(settingsData.kosten_ziel) || 20 })
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

  return (
    <div className="max-w-xl mx-auto">

      {/* Hero banner */}
      <div className="relative rounded-2xl overflow-hidden mb-6 p-7"
        style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4c1d95 100%)' }}>
        {/* Decorative circles */}
        <div className="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />
        <div className="absolute right-20 -bottom-8 w-32 h-32 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#a5b4fc' }}>
            {greeting()}
          </p>
          <h1 className="text-2xl font-bold text-white mb-3">{todayLabel}</h1>

          {(marker?.training || marker?.eingeladen) && (
            <div className="flex gap-2 mb-4">
              {marker.training   && <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'rgba(59,130,246,0.3)', color: '#93c5fd' }}>Training</span>}
              {marker.eingeladen && <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: 'rgba(168,85,247,0.3)', color: '#c4b5fd' }}>Eingeladen</span>}
            </div>
          )}

          {/* Inline stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Kalorien', value: Math.round(kcal),    max: goals.kcal,    display: `${Math.round(kcal)}`, unit: 'kcal' },
              { label: 'Protein',  value: protein,             max: goals.protein, display: `${Math.round(protein * 10) / 10}`, unit: 'g' },
              { label: 'Kosten',   value: cost,                max: goals.kosten,  display: cost.toFixed(2), unit: 'CHF', prefix: true },
            ].map(s => {
              const pct = s.max > 0 ? Math.round((s.value / s.max) * 100) : 0
              const color = goalColor(s.value, s.max)
              return (
                <div key={s.label} className="flex flex-col items-center">
                  <div className="relative mb-1.5">
                    <ArcProgress value={s.value} max={s.max} size={90} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold text-white">{pct}%</span>
                    </div>
                  </div>
                  <p className="text-lg font-black" style={{ color }}>
                    {s.prefix ? `CHF ${s.display}` : s.display}
                    {!s.prefix && <span className="text-xs font-normal ml-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.unit}</span>}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {s.prefix ? `/ CHF ${s.max}` : `/ ${s.max}${s.unit}`}
                  </p>
                  <p className="text-xs font-semibold mt-1" style={{ color: '#94a3b8' }}>{s.label}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Today's meals */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-sm font-bold text-white">Heutiger Menüplan</span>
          <Link href={`/tag/${todayStr}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
            Bearbeiten →
          </Link>
        </div>

        {meals.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm mb-4" style={{ color: '#475569' }}>Noch nichts für heute geplant.</p>
            <Link href={`/tag/${todayStr}`}
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              Jetzt planen
            </Link>
          </div>
        ) : (
          MEAL_ORDER.map((type, i) => {
            const meal = meals.find(m => m.meal_type === type)
            const meta = MEAL_META[type]
            return (
              <div key={type} className="flex items-center gap-4 px-5 py-3.5"
                style={{ borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                {/* Colored dot */}
                <div className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: meta.gradient }} />
                <span className="text-xs font-bold w-22 shrink-0" style={{ color: '#94a3b8', minWidth: '5rem' }}>
                  {meta.label}
                </span>
                {meal ? (
                  <>
                    <span className="text-sm text-white flex-1 truncate font-medium">{meal.name}</span>
                    <div className="flex gap-3 shrink-0">
                      <span className={`text-xs font-semibold ${goalTextClass(meal.kcal_total, 0)}`} style={{ color: goalColor(meal.kcal_total, 0) }}>
                        {Math.round(meal.kcal_total)} kcal
                      </span>
                      <span className="text-xs" style={{ color: '#64748b' }}>{meal.protein_total}g P</span>
                    </div>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: '#334155' }}>—</span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        {[
          { href: '/kalender', label: 'Wochenplanung', color: 'rgba(99,102,241,0.15)', textColor: '#a5b4fc', border: 'rgba(99,102,241,0.2)' },
          { href: '/einkaufsliste', label: 'Einkaufsliste', color: 'rgba(16,185,129,0.12)', textColor: '#6ee7b7', border: 'rgba(16,185,129,0.2)' },
        ].map(item => (
          <Link key={item.href} href={item.href}
            className="rounded-xl px-4 py-3.5 text-sm font-semibold transition-all text-center"
            style={{ background: item.color, color: item.textColor, border: `1px solid ${item.border}` }}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
