'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadSettings, goalColor, limitColor } from '@/lib/settings'
import { useSwipe } from '@/lib/useSwipe'

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

const MEAL_ORDER = ['fruehstueck', 'mittagessen', 'abendessen', 'snack']
const MEAL_META: Record<string, { label: string; color: string }> = {
  fruehstueck: { label: 'Frühstück',   color: '#d97706' },
  mittagessen: { label: 'Mittagessen', color: '#059669' },
  abendessen:  { label: 'Abendessen',  color: '#4f46e5' },
  snack:       { label: 'Snack',       color: '#7c3aed' },
}

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 17) return 'Guten Tag'
  return 'Guten Abend'
}

function ArcProgress({ value, max, size = 100, color: colorProp }: { value: number; max: number; size?: number; color?: string }) {
  const r = size * 0.37
  const circ = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const color = colorProp ?? goalColor(value, max)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="8"
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
  const router = useRouter()

  const [plan, setPlan]     = useState<Plan | null>(null)
  const [meals, setMeals]   = useState<Meal[]>([])
  const [marker, setMarker] = useState<DayMarker | null>(null)
  const [goals, setGoals]   = useState({ kcal: 2000, protein: 150, kosten: 20 })

  useSwipe({
    onSwipeLeft:  () => router.push(`/tag/${todayStr}`),
    onSwipeRight: () => router.push('/kalender'),
  })

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

      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>
          {greeting()}
        </p>
        <h1 className="text-xl font-bold" style={{ color: '#1e293b' }}>{todayLabel}</h1>

        {(marker?.training || marker?.eingeladen) && (
          <div className="flex gap-2 mt-2">
            {marker.training   && <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Training</span>}
            {marker.eingeladen && <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: '#ede9fe', color: '#6d28d9' }}>Eingeladen</span>}
          </div>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Kalorien', value: Math.round(kcal),    max: goals.kcal,    display: `${Math.round(kcal)}`, unit: 'kcal', limit: true },
          { label: 'Protein',  value: protein,             max: goals.protein, display: `${Math.round(protein * 10) / 10}`, unit: 'g', limit: false },
          { label: 'Kosten',   value: cost,                max: goals.kosten,  display: cost.toFixed(2), unit: 'CHF', prefix: true, limit: true },
        ].map(s => {
          const pct = s.max > 0 ? Math.round((s.value / s.max) * 100) : 0
          const color = s.limit ? limitColor(s.value, s.max) : goalColor(s.value, s.max)
          return (
            <div key={s.label} className="rounded-2xl p-4 flex flex-col items-center"
              style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
              <div className="relative mb-2">
                <ArcProgress value={s.value} max={s.max} size={80} color={color} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold" style={{ color: '#475569' }}>{pct}%</span>
                </div>
              </div>
              <p className="text-base font-extrabold" style={{ color }}>
                {s.prefix ? `CHF ${s.display}` : s.display}
                {!s.prefix && <span className="text-xs font-normal ml-0.5" style={{ color: '#94a3b8' }}>{s.unit}</span>}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>
                {s.prefix ? `/ CHF ${s.max}` : `/ ${s.max}${s.unit}`}
              </p>
              <p className="text-[11px] font-semibold mt-1" style={{ color: '#64748b' }}>{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Today's meals */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <span className="text-sm font-bold" style={{ color: '#1e293b' }}>Heutiger Menüplan</span>
          <Link href={`/tag/${todayStr}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: '#f1f5f9', color: '#475569' }}>
            Bearbeiten →
          </Link>
        </div>

        {meals.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm mb-4" style={{ color: '#94a3b8' }}>Noch nichts für heute geplant.</p>
            <Link href={`/tag/${todayStr}`}
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all"
              style={{ background: '#475569' }}>
              Jetzt planen
            </Link>
          </div>
        ) : (
          MEAL_ORDER.map((type, i) => {
            const meal = meals.find(m => m.meal_type === type)
            const meta = MEAL_META[type]
            return (
              <div key={type} className="flex items-center gap-4 px-5 py-3.5"
                style={{ borderBottom: i < 3 ? '1px solid #f8fafc' : 'none' }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="text-xs font-bold w-22 shrink-0" style={{ color: '#94a3b8', minWidth: '5rem' }}>
                  {meta.label}
                </span>
                {meal ? (
                  <>
                    <span className="text-sm flex-1 truncate font-medium" style={{ color: '#1e293b' }}>{meal.name}</span>
                    <div className="flex gap-3 shrink-0">
                      <span className="text-xs font-semibold" style={{ color: goalColor(meal.kcal_total, 0) }}>
                        {Math.round(meal.kcal_total)} kcal
                      </span>
                      <span className="text-xs" style={{ color: '#94a3b8' }}>{meal.protein_total}g P</span>
                    </div>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: '#cbd5e1' }}>—</span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3 mt-4">
        {[
          { href: '/kalender', label: 'Wochenplanung', bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' },
          { href: '/einkaufsliste', label: 'Einkaufsliste', bg: '#f0fdf4', color: '#166534', border: '#dcfce7' },
        ].map(item => (
          <Link key={item.href} href={item.href}
            className="rounded-xl px-4 py-3.5 text-sm font-semibold transition-all text-center"
            style={{ background: item.bg, color: item.color, border: `1px solid ${item.border}` }}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
