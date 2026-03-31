'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

interface Plan {
  date: string
  kcal_total: number
  protein_total: number
  cost_total: number
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function getMondayOfWeek(d: Date) {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday
}

export default function KalenderPage() {
  const [view, setView] = useState<'monat' | 'woche'>('monat')
  const [anchor, setAnchor] = useState(new Date())
  const [plans, setPlans] = useState<Plan[]>([])

  const todayStr = toDateStr(new Date())

  const year  = anchor.getFullYear()
  const month = anchor.getMonth()

  useEffect(() => { loadPlans() }, [year, month, view, anchor])

  async function loadPlans() {
    let start: string, end: string
    if (view === 'monat') {
      start = toDateStr(new Date(year, month, 1))
      end   = toDateStr(new Date(year, month + 1, 0))
    } else {
      const mon = getMondayOfWeek(anchor)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      start = toDateStr(mon)
      end   = toDateStr(sun)
    }
    const { data } = await supabase
      .from('meal_plans')
      .select('date, kcal_total, protein_total, cost_total')
      .gte('date', start)
      .lte('date', end)
    setPlans(data || [])
  }

  function planFor(dateStr: string) {
    return plans.find(p => p.date === dateStr)
  }

  // ── Month view ──────────────────────────────────────────────
  function renderMonth() {
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    let startOffset = firstDay.getDay()
    startOffset = startOffset === 0 ? 6 : startOffset - 1

    const cells: (Date | null)[] = []
    for (let i = 0; i < startOffset; i++) cells.push(null)
    for (let i = 1; i <= lastDay.getDate(); i++) cells.push(new Date(year, month, i))

    return (
      <div className="bg-white rounded-xl border border-gray-200">
        {/* Nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={() => setAnchor(new Date(year, month - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            ←
          </button>
          <span className="font-medium text-gray-900 text-sm">{MONTH_NAMES[month]} {year}</span>
          <button onClick={() => setAnchor(new Date(year, month + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            →
          </button>
        </div>
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-50">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[90px] border-b border-r border-gray-50" />
            const ds   = toDateStr(day)
            const plan = planFor(ds)
            const isToday = ds === todayStr
            return (
              <Link
                key={i}
                href={`/tag/${ds}`}
                className={`min-h-[90px] border-b border-r border-gray-50 p-2 hover:bg-gray-50 transition-colors ${isToday ? 'bg-indigo-50/40' : ''}`}
              >
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm ${
                  isToday ? 'bg-indigo-600 text-white font-semibold' : 'text-gray-700'
                }`}>
                  {day.getDate()}
                </span>
                {plan && (
                  <div className="mt-1.5 space-y-0.5">
                    <div className="text-[10px] text-gray-600 font-medium">{Math.round(plan.kcal_total)} kcal</div>
                    <div className="text-[10px] text-gray-400">{plan.protein_total}g P</div>
                    <div className="text-[10px] text-gray-400">CHF {Number(plan.cost_total).toFixed(2)}</div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Week view ────────────────────────────────────────────────
  function renderWeek() {
    const monday = getMondayOfWeek(anchor)
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(d)
    }

    const weekEnd = new Date(monday); weekEnd.setDate(monday.getDate() + 6)
    const label = `${monday.getDate()}. ${MONTH_NAMES[monday.getMonth()]} – ${weekEnd.getDate()}. ${MONTH_NAMES[weekEnd.getMonth()]} ${year}`

    return (
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={() => { const p = new Date(anchor); p.setDate(p.getDate() - 7); setAnchor(p) }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            ←
          </button>
          <span className="font-medium text-gray-900 text-sm">{label}</span>
          <button onClick={() => { const n = new Date(anchor); n.setDate(n.getDate() + 7); setAnchor(n) }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
            →
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {days.map((day, i) => {
            const ds   = toDateStr(day)
            const plan = planFor(ds)
            const isToday = ds === todayStr
            return (
              <Link key={i} href={`/tag/${ds}`}
                className={`flex items-center px-5 py-3.5 hover:bg-gray-50 transition-colors ${isToday ? 'bg-indigo-50/40' : ''}`}
              >
                <div className="w-24 shrink-0">
                  <span className={`text-sm font-medium ${isToday ? 'text-indigo-600' : 'text-gray-900'}`}>
                    {DAY_NAMES[i]}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {day.getDate()}. {MONTH_NAMES[day.getMonth()].slice(0, 3)}.
                  </span>
                </div>
                {plan ? (
                  <div className="flex gap-6 text-sm">
                    <span className="text-gray-700 font-medium">{Math.round(plan.kcal_total)} kcal</span>
                    <span className="text-gray-500">{plan.protein_total}g Protein</span>
                    <span className="text-gray-500">CHF {Number(plan.cost_total).toFixed(2)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-300">Noch nichts geplant</span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Kalender</h1>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['woche', 'monat'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors capitalize ${
                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v === 'woche' ? 'Woche' : 'Monat'}
            </button>
          ))}
        </div>
      </div>

      {view === 'monat' ? renderMonth() : renderWeek()}

      <div className="mt-4 text-center">
        <Link href={`/tag/${todayStr}`}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
          Heute öffnen →
        </Link>
      </div>
    </div>
  )
}
