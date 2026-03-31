'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadSettings, goalColor, goalTextClass } from '@/lib/settings'

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const DAY_NAMES_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const DAY_NAMES_LONG  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

interface Plan {
  date: string; kcal_total: number; protein_total: number; cost_total: number
}
interface Marker {
  date: string; training: boolean; eingeladen: boolean
}
interface Goals { kcal: number; protein: number }

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }
function getMondayOfWeek(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(d.getDate() + diff); return m
}

// ── Day status helper ────────────────────────────────────────
function dayStatus(plan: Plan | undefined, goals: Goals): 'empty' | 'partial' | 'good' | 'complete' {
  if (!plan || plan.kcal_total === 0) return 'empty'
  const pct = plan.kcal_total / goals.kcal
  if (pct >= 0.95) return 'complete'
  if (pct >= 0.6)  return 'good'
  return 'partial'
}

const STATUS_STYLE = {
  empty:    'bg-white',
  partial:  'bg-amber-50',
  good:     'bg-emerald-50',
  complete: 'bg-emerald-100',
}

// ── Export helper ─────────────────────────────────────────────
function exportWeek(days: Date[], plans: Plan[], markers: Marker[], goals: Goals) {
  const rows = days.map(d => {
    const ds = toDateStr(d)
    const p  = plans.find(pl => pl.date === ds)
    const m  = markers.find(mk => mk.date === ds)
    return { date: ds, day: DAY_NAMES_LONG[(d.getDay() + 6) % 7], plan: p, marker: m }
  })

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<title>Menüplan Export</title>
<style>
  body { font-family: sans-serif; padding: 2rem; color: #111; }
  h1 { font-size: 1.2rem; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { text-align: left; background: #f8fafc; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
  .green { color: #16a34a; } .red { color: #dc2626; } .amber { color: #d97706; }
  .badge { display: inline-block; font-size: 0.7rem; padding: 1px 6px; border-radius: 99px; margin-left: 4px; }
  .training { background: #dbeafe; color: #1d4ed8; }
  .eingeladen { background: #ede9fe; color: #6d28d9; }
</style></head><body>
<h1>Wochenübersicht ${rows[0]?.date} bis ${rows[6]?.date}</h1>
<p style="font-size:0.75rem;color:#6b7280;">Ziele: ${goals.kcal} kcal · ${goals.protein}g Protein</p>
<table>
  <thead><tr>
    <th>Tag</th><th>Kalorien</th><th>Protein</th><th>Kosten</th><th>Notizen</th>
  </tr></thead>
  <tbody>
  ${rows.map(r => {
    const kcalPct = r.plan ? r.plan.kcal_total / goals.kcal : 0
    const cls = kcalPct >= 1 ? 'green' : kcalPct >= 0.8 ? 'amber' : r.plan ? 'red' : ''
    return `<tr>
      <td><strong>${r.day}</strong>, ${new Date(r.date + 'T12:00:00').getDate()}. ${MONTH_NAMES[new Date(r.date + 'T12:00:00').getMonth()]}</td>
      <td class="${cls}">${r.plan ? Math.round(r.plan.kcal_total) + ' kcal' : '–'}</td>
      <td>${r.plan ? r.plan.protein_total + 'g' : '–'}</td>
      <td>${r.plan ? 'CHF ' + Number(r.plan.cost_total).toFixed(2) : '–'}</td>
      <td>${r.marker?.training ? '<span class="badge training">Training</span>' : ''}${r.marker?.eingeladen ? '<span class="badge eingeladen">Eingeladen</span>' : ''}</td>
    </tr>`
  }).join('')}
  </tbody>
</table>
<script>window.print()</script>
</body></html>`

  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

// ── Day Popup ─────────────────────────────────────────────────
interface PopupProps {
  dateStr: string
  plan?: Plan
  marker?: Marker
  goals: Goals
  onClose: () => void
  onMarkerChange: () => void
}

function DayPopup({ dateStr, plan, marker, goals, onClose, onMarkerChange }: PopupProps) {
  const router = useRouter()
  const d = new Date(dateStr + 'T12:00:00')
  const label = `${DAY_NAMES_LONG[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  async function toggleMarker(field: 'training' | 'eingeladen') {
    const current = marker?.[field] ?? false
    await supabase.from('day_markers').upsert({
      date: dateStr,
      training:   field === 'training'   ? !current : (marker?.training   ?? false),
      eingeladen: field === 'eingeladen' ? !current : (marker?.eingeladen ?? false),
    })
    onMarkerChange()
  }

  const kcal    = plan?.kcal_total    ?? 0
  const protein = plan?.protein_total ?? 0

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div ref={ref} className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-900">{label}</h3>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Stats */}
          {plan && kcal > 0 ? (
            <div className="space-y-2">
              {[
                { label: 'Kalorien', value: Math.round(kcal),    max: goals.kcal,    unit: 'kcal' },
                { label: 'Protein',  value: Math.round(protein * 10) / 10, max: goals.protein, unit: 'g' },
                { label: 'Kosten',   value: Number(plan.cost_total).toFixed(2), max: 0, unit: 'CHF', prefix: true },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">{s.label}</span>
                    <span className={`font-medium ${goalTextClass(Number(s.value), s.max)}`}>
                      {s.prefix ? `CHF ${s.value}` : `${s.value}${s.unit}`}
                      {s.max > 0 && <span className="text-gray-400 font-normal"> / {s.max}{s.unit}</span>}
                    </span>
                  </div>
                  {s.max > 0 && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((Number(s.value) / s.max) * 100, 100)}%`,
                          backgroundColor: goalColor(Number(s.value), s.max),
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">Noch nichts geplant</p>
          )}

          {/* Markers */}
          <div className="border-t border-gray-100 pt-4 space-y-2">
            {(['training', 'eingeladen'] as const).map(field => (
              <label key={field} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => toggleMarker(field)}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                    marker?.[field] ? (field === 'training' ? 'bg-blue-500' : 'bg-purple-500') : 'bg-gray-200'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    marker?.[field] ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-sm text-gray-700 capitalize select-none">{field}</span>
                {field === 'training'   && <span className="text-xs text-blue-500">Trainingstag markieren</span>}
                {field === 'eingeladen' && <span className="text-xs text-purple-500">Auswärts essen</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={() => router.push(`/tag/${dateStr}`)}
            className="w-full bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Zum Tagesplan →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function KalenderPage() {
  const [anchor, setAnchor] = useState(new Date())
  const [plans, setPlans]   = useState<Plan[]>([])
  const [markers, setMarkers] = useState<Marker[]>([])
  const [goals, setGoals]   = useState<Goals>({ kcal: 2000, protein: 150 })
  const [popup, setPopup]   = useState<string | null>(null) // selected dateStr

  const today    = new Date()
  const todayStr = toDateStr(today)
  const year     = anchor.getFullYear()
  const month    = anchor.getMonth()

  useEffect(() => { loadAll() }, [year, month])

  async function loadAll() {
    const start = toDateStr(new Date(year, month, 1))
    const end   = toDateStr(new Date(year, month + 1, 0))
    const [planRes, markerRes, settingsData] = await Promise.all([
      supabase.from('meal_plans').select('date,kcal_total,protein_total,cost_total').gte('date', start).lte('date', end),
      supabase.from('day_markers').select('date,training,eingeladen').gte('date', start).lte('date', end),
      loadSettings(),
    ])
    setPlans(planRes.data || [])
    setMarkers(markerRes.data || [])
    setGoals({ kcal: parseInt(settingsData.kcal_ziel) || 2000, protein: parseInt(settingsData.protein_ziel) || 150 })
  }

  function planFor(ds: string) { return plans.find(p => p.date === ds) }
  function markerFor(ds: string) { return markers.find(m => m.date === ds) }

  // ── Build calendar grid ──────────────────────────────────────
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  let startOff   = firstDay.getDay(); startOff = startOff === 0 ? 6 : startOff - 1
  const cells: (Date | null)[] = []
  for (let i = 0; i < startOff; i++) cells.push(null)
  for (let i = 1; i <= lastDay.getDate(); i++) cells.push(new Date(year, month, i))

  // Current week for export
  const monday = getMondayOfWeek(today)
  const thisWeek: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d
  })

  const popupPlan   = popup ? planFor(popup) : undefined
  const popupMarker = popup ? markerFor(popup) : undefined

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Kalender</h1>
        <button
          onClick={() => exportWeek(thisWeek, plans, markers, goals)}
          className="no-print text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 bg-white hover:bg-gray-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Woche exportieren
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Vollständig</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-50 border border-amber-200" /> Teilweise</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Training</div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-purple-400" /> Eingeladen</div>
      </div>

      {/* Calendar card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={() => setAnchor(new Date(year, month - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">←</button>
          <div className="text-center">
            <span className="font-semibold text-gray-900">{MONTH_NAMES[month]} {year}</span>
            <button onClick={() => setAnchor(new Date())}
              className="block mx-auto text-xs text-indigo-500 hover:text-indigo-700 mt-0.5">
              Heute
            </button>
          </div>
          <button onClick={() => setAnchor(new Date(year, month + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">→</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
          {DAY_NAMES_SHORT.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="min-h-[88px] border-b border-r border-gray-50" />
            const ds      = toDateStr(day)
            const plan    = planFor(ds)
            const marker  = markerFor(ds)
            const isToday = ds === todayStr
            const isPast  = ds < todayStr
            const status  = dayStatus(plan, goals)
            const isWeek  = thisWeek.some(d => toDateStr(d) === ds)

            return (
              <button
                key={i}
                onClick={() => setPopup(ds)}
                className={`min-h-[88px] border-b border-r border-gray-100 p-2 text-left transition-all hover:brightness-95 active:scale-95 ${
                  STATUS_STYLE[status]
                } ${isWeek && !isToday ? 'ring-1 ring-inset ring-indigo-200' : ''}`}
              >
                {/* Day number */}
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                  isToday
                    ? 'bg-indigo-600 text-white font-bold'
                    : isPast && status === 'empty'
                    ? 'text-gray-300'
                    : 'text-gray-700'
                }`}>
                  {day.getDate()}
                </span>

                {/* Markers */}
                {(marker?.training || marker?.eingeladen) && (
                  <div className="flex gap-1 mt-1">
                    {marker.training   && <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                    {marker.eingeladen && <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />}
                  </div>
                )}

                {/* Stats */}
                {plan && plan.kcal_total > 0 && (
                  <div className="mt-1 space-y-0.5">
                    <div className={`text-[10px] font-medium ${goalTextClass(plan.kcal_total, goals.kcal)}`}>
                      {Math.round(plan.kcal_total)} kcal
                    </div>
                    <div className="text-[10px] text-gray-400">{plan.protein_total}g P</div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day popup */}
      {popup && (
        <DayPopup
          dateStr={popup}
          plan={popupPlan}
          marker={popupMarker}
          goals={goals}
          onClose={() => setPopup(null)}
          onMarkerChange={() => { loadAll(); }}
        />
      )}
    </div>
  )
}
