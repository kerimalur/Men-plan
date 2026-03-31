'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadSettings, goalColor } from '@/lib/settings'

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const DAY_LONG  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

interface Plan   { date: string; kcal_total: number; protein_total: number; cost_total: number }
interface Marker { date: string; training: boolean; eingeladen: boolean }
interface Goals  { kcal: number; protein: number }

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }
function getMondayOfWeek(d: Date) {
  const day = d.getDay(), diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(d.getDate() + diff); return m
}

function tileStyle(plan: Plan | undefined, goals: Goals, isToday: boolean, isPast: boolean): React.CSSProperties {
  if (isToday) return { background: '#eef2ff', border: '1.5px solid #818cf8' }
  if (!plan || plan.kcal_total === 0) {
    if (isPast) return { background: '#f8fafc', border: '1px solid #f1f5f9' }
    return { background: 'white', border: '1px dashed #e2e8f0' }
  }
  const pct = plan.kcal_total / goals.kcal
  if (pct >= 0.95) return { background: '#f0fdf4', border: '1px solid #bbf7d0' }
  if (pct >= 0.6)  return { background: '#fffbeb', border: '1px solid #fde68a' }
  return { background: '#fef2f2', border: '1px solid #fecaca' }
}

function exportWeek(days: Date[], plans: Plan[], markers: Marker[], goals: Goals) {
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>Wochenexport</title>
<style>body{font-family:sans-serif;padding:2rem;background:#fff;color:#111}h1{font-size:1.1rem;margin-bottom:1.5rem}
table{width:100%;border-collapse:collapse;font-size:.85rem}th{text-align:left;padding:8px 12px;background:#f8fafc;border-bottom:2px solid #e2e8f0;color:#64748b;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}
td{padding:10px 12px;border-bottom:1px solid #f1f5f9}
.green{color:#16a34a;font-weight:600}.amber{color:#d97706;font-weight:600}.red{color:#dc2626;font-weight:600}
.badge{font-size:.65rem;padding:2px 7px;border-radius:99px;margin-left:4px}
.tr{background:#dbeafe;color:#1d4ed8}.ei{background:#ede9fe;color:#6d28d9}</style></head><body>
<h1>Wochenübersicht · ${days[0].toLocaleDateString('de-CH',{day:'numeric',month:'long'})} – ${days[6].toLocaleDateString('de-CH',{day:'numeric',month:'long',year:'numeric'})}</h1>
<table><thead><tr><th>Tag</th><th>Kalorien</th><th>Protein</th><th>Kosten</th><th></th></tr></thead><tbody>
${days.map(d => {
  const ds = toDateStr(d); const p = plans.find(x => x.date === ds); const m = markers.find(x => x.date === ds)
  const pct = p ? p.kcal_total / goals.kcal : 0
  const cls = pct >= 1 ? 'green' : pct >= 0.8 ? 'amber' : p ? 'red' : ''
  return `<tr><td><strong>${DAY_LONG[(d.getDay()+6)%7]}</strong>, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}</td>
<td class="${cls}">${p ? Math.round(p.kcal_total)+' kcal' : '–'}</td>
<td>${p ? p.protein_total+'g' : '–'}</td><td>${p ? 'CHF '+Number(p.cost_total).toFixed(2) : '–'}</td>
<td>${m?.training?'<span class="badge tr">Training</span>':''}${m?.eingeladen?'<span class="badge ei">Eingeladen</span>':''}</td></tr>`
}).join('')}
</tbody></table><script>window.print()</script></body></html>`
  const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
}

// ── Day Popup ─────────────────────────────────────────────────
function DayPopup({ dateStr, plan, marker, goals, onClose, onMarkerChange }: {
  dateStr: string; plan?: Plan; marker?: Marker; goals: Goals
  onClose: () => void; onMarkerChange: () => void
}) {
  const router = useRouter()
  const d = new Date(dateStr + 'T12:00:00')
  const label = `${DAY_LONG[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  async function toggleMarker(field: 'training' | 'eingeladen') {
    await supabase.from('day_markers').upsert({
      date: dateStr,
      training:   field === 'training'   ? !(marker?.training   ?? false) : (marker?.training   ?? false),
      eingeladen: field === 'eingeladen' ? !(marker?.eingeladen ?? false) : (marker?.eingeladen ?? false),
    })
    onMarkerChange()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div ref={ref} className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
              {d.getFullYear()}
            </p>
            <h3 className="text-sm font-bold mt-0.5" style={{ color: '#1e293b' }}>{label}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none transition-all"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Stats */}
          {plan && plan.kcal_total > 0 ? (
            <div className="space-y-3">
              {[
                { label: 'Kalorien', v: Math.round(plan.kcal_total),         max: goals.kcal,    u: 'kcal' },
                { label: 'Protein',  v: Math.round(plan.protein_total * 10) / 10, max: goals.protein, u: 'g' },
                { label: 'Kosten',   v: Number(plan.cost_total).toFixed(2),   max: 0,             u: 'CHF', pre: true },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span style={{ color: '#64748b' }}>{s.label}</span>
                    <span className="font-bold" style={{ color: goalColor(Number(s.v), s.max) }}>
                      {s.pre ? `CHF ${s.v}` : `${s.v}${s.u}`}
                      {s.max > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}> / {s.max}{s.u}</span>}
                    </span>
                  </div>
                  {s.max > 0 && (
                    <div className="h-1.5 rounded-full" style={{ background: '#f1f5f9' }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.min((Number(s.v) / s.max) * 100, 100)}%`,
                        background: goalColor(Number(s.v), s.max),
                      }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-3 text-center">
              <p className="text-sm" style={{ color: '#94a3b8' }}>Noch nichts geplant</p>
            </div>
          )}

          {/* Toggles */}
          <div className="pt-1 space-y-2" style={{ borderTop: '1px solid #f1f5f9' }}>
            {([
              { field: 'training'   as const, label: 'Trainingstag', color: '#2563eb', bg: '#eff6ff' },
              { field: 'eingeladen' as const, label: 'Eingeladen / Auswärts', color: '#7c3aed', bg: '#f5f3ff' },
            ]).map(({ field, label, color, bg }) => (
              <div key={field} className="flex items-center justify-between py-2 px-3 rounded-xl cursor-pointer transition-all"
                style={{ background: marker?.[field] ? bg : '#f8fafc' }}
                onClick={() => toggleMarker(field)}>
                <span className="text-sm font-medium" style={{ color: marker?.[field] ? color : '#94a3b8' }}>{label}</span>
                <div className="w-9 h-5 rounded-full relative transition-all"
                  style={{ background: marker?.[field] ? color : '#e2e8f0' }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: marker?.[field] ? 'translateX(1.1rem)' : 'translateX(0.125rem)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5">
          <button onClick={() => router.push(`/tag/${dateStr}`)}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: '#475569' }}>
            Zum Tagesplan →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────
export default function KalenderPage() {
  const [anchor, setAnchor]   = useState(new Date())
  const [plans, setPlans]     = useState<Plan[]>([])
  const [markers, setMarkers] = useState<Marker[]>([])
  const [goals, setGoals]     = useState<Goals>({ kcal: 2000, protein: 150 })
  const [popup, setPopup]     = useState<string | null>(null)

  const today = new Date(), todayStr = toDateStr(today)
  const year  = anchor.getFullYear(), month = anchor.getMonth()

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

  const monday    = getMondayOfWeek(today)
  const thisWeek  = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
  const firstDay  = new Date(year, month, 1)
  const lastDay   = new Date(year, month + 1, 0)
  let startOff    = firstDay.getDay(); startOff = startOff === 0 ? 6 : startOff - 1
  const cells: (Date | null)[] = []
  for (let i = 0; i < startOff; i++) cells.push(null)
  for (let i = 1; i <= lastDay.getDate(); i++) cells.push(new Date(year, month, i))

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold" style={{ color: '#1e293b' }}>Kalender</h1>
        <button onClick={() => exportWeek(thisWeek, plans, markers, goals)}
          className="no-print flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-all"
          style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Woche exportieren
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {[
          { color: '#bbf7d0', label: 'Vollständig' },
          { color: '#fde68a',  label: 'Teilweise' },
          { color: '#2563eb',  label: 'Training', dot: true },
          { color: '#7c3aed',  label: 'Eingeladen', dot: true },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`${l.dot ? 'w-2 h-2 rounded-full' : 'w-3 h-3 rounded-sm'}`}
              style={{ background: l.color, border: l.dot ? 'none' : `1px solid ${l.color}` }} />
            <span className="text-xs" style={{ color: '#64748b' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <button onClick={() => setAnchor(new Date(year, month - 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
            style={{ color: '#64748b', background: '#f1f5f9' }}>←</button>
          <div className="text-center">
            <span className="font-bold text-sm" style={{ color: '#1e293b' }}>{MONTH_NAMES[month]} {year}</span>
            <button onClick={() => setAnchor(new Date())}
              className="block mx-auto text-xs mt-0.5 transition-all" style={{ color: '#475569' }}>Heute</button>
          </div>
          <button onClick={() => setAnchor(new Date(year, month + 1, 1))}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-all"
            style={{ color: '#64748b', background: '#f1f5f9' }}>→</button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 px-3 pt-3">
          {DAY_SHORT.map(d => (
            <div key={d} className="text-center text-xs font-bold pb-2 uppercase tracking-wider" style={{ color: '#94a3b8' }}>{d}</div>
          ))}
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-7 gap-1.5 px-3 pb-3">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="rounded-xl" style={{ minHeight: 80 }} />
            const ds      = toDateStr(day)
            const plan    = plans.find(p => p.date === ds)
            const marker  = markers.find(m => m.date === ds)
            const isToday = ds === todayStr
            const isPast  = ds < todayStr
            const isWeek  = thisWeek.some(d => toDateStr(d) === ds)

            return (
              <button key={i} onClick={() => setPopup(ds)}
                className="rounded-xl p-2 flex flex-col transition-all active:scale-95"
                style={{ minHeight: 80, ...tileStyle(plan, goals, isToday, isPast), outline: isWeek && !isToday ? '1px solid #c7d2fe' : 'none', outlineOffset: '-1px' }}>

                {/* Number */}
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mb-1"
                  style={isToday ? { background: '#475569', color: 'white' } : isPast && !plan ? { color: '#cbd5e1' } : { color: '#475569' }}>
                  {day.getDate()}
                </span>

                {/* Marker dots */}
                {(marker?.training || marker?.eingeladen) && (
                  <div className="flex gap-1 mb-1">
                    {marker.training   && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#2563eb' }} />}
                    {marker.eingeladen && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#7c3aed' }} />}
                  </div>
                )}

                {/* Stats */}
                {plan && plan.kcal_total > 0 && (
                  <div>
                    <div className="text-[10px] font-bold leading-tight" style={{ color: goalColor(plan.kcal_total, goals.kcal) }}>
                      {Math.round(plan.kcal_total)}
                    </div>
                    <div className="text-[9px] leading-tight" style={{ color: '#94a3b8' }}>kcal</div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {popup && (
        <DayPopup
          dateStr={popup}
          plan={plans.find(p => p.date === popup)}
          marker={markers.find(m => m.date === popup)}
          goals={goals}
          onClose={() => setPopup(null)}
          onMarkerChange={loadAll}
        />
      )}
    </div>
  )
}
