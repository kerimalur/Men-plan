'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { loadSettings, limitColor } from '@/lib/settings'
import { useSwipe } from '@/lib/useSwipe'
import { MONTH_NAMES, DAY_SHORT, toDateStr, getMondayOfWeek } from '@/lib/dates'
import { MEAL_TYPE_ORDER } from '@/lib/mealTypes'
import { exportWeek, exportMonth } from '@/lib/export'
import { useToast } from '@/components/Toast'
import DayPopup from '@/components/DayPopup'
import SaveDayTemplateModal from '@/components/SaveDayTemplateModal'
import LoadTemplateModal from '@/components/LoadTemplateModal'
import CopyDayModal from '@/components/CopyDayModal'

interface Plan   { date: string; kcal_total: number; protein_total: number; cost_total: number; meals?: { meal_type: string }[] }
interface Marker { date: string; training: boolean; eingeladen: boolean }
interface Goals  { kcal: number; protein: number; kosten: number }

function isDayComplete(plan?: Plan) {
  if (!plan?.meals) return false
  const types = new Set(plan.meals.map(m => m.meal_type))
<<<<<<< HEAD
  return REQUIRED_MEALS.every(t => types.has(t))
}

function toDateStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function getMondayOfWeek(d: Date) {
  const day = d.getDay(), diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(d.getDate() + diff); return m
=======
  return MEAL_TYPE_ORDER.every(t => types.has(t))
>>>>>>> ab9318841c60072b04a2bd0468a6741c37c57ce4
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

export default function KalenderPage() {
  const { toast } = useToast()
  const [anchor, setAnchor]   = useState(new Date())
  const [plans, setPlans]     = useState<Plan[]>([])
  const [markers, setMarkers] = useState<Marker[]>([])
  const [goals, setGoals]     = useState<Goals>({ kcal: 2000, protein: 150, kosten: 20 })
  const [popup, setPopup]     = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [templateAction, setTemplateAction] = useState<{ type: 'save' | 'load' | 'copy'; dateStr: string } | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const today = new Date(), todayStr = toDateStr(today)
  const year  = anchor.getFullYear(), month = anchor.getMonth()

  useEffect(() => { loadAll() }, [year, month])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function loadAll() {
    try {
      const start = toDateStr(new Date(year, month, 1))
      const end   = toDateStr(new Date(year, month + 1, 0))
      const [planRes, markerRes, settingsData] = await Promise.all([
        supabase.from('meal_plans').select('date,kcal_total,protein_total,cost_total,meals(meal_type)').gte('date', start).lte('date', end),
        supabase.from('day_markers').select('date,training,eingeladen').gte('date', start).lte('date', end),
        loadSettings(),
      ])
      if (planRes.error) throw planRes.error
      if (markerRes.error) throw markerRes.error
      setPlans(planRes.data || [])
      setMarkers(markerRes.data || [])
      setGoals({ kcal: parseInt(settingsData.kcal_ziel) || 2000, protein: parseInt(settingsData.protein_ziel) || 150, kosten: parseInt(settingsData.kosten_ziel) || 20 })
    } catch {
      toast('Fehler beim Laden der Kalenderdaten', 'error')
    }
  }

  const monday    = getMondayOfWeek(today)
  const thisWeek  = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })

  useSwipe({
    onSwipeLeft:  () => setAnchor(new Date(year, month + 1, 1)),
    onSwipeRight: () => setAnchor(new Date(year, month - 1, 1)),
  })
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
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setShowExportMenu(v => !v)}
            className="no-print flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-all"
            style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportieren ▾
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-xl z-50 overflow-hidden"
              style={{ background: 'white', border: '1px solid #e2e8f0' }}>
              <button
                onClick={() => { exportWeek(thisWeek, plans, markers, goals); setShowExportMenu(false) }}
                className="w-full text-left px-4 py-3 text-sm transition-colors"
                style={{ color: '#1e293b' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                <span className="font-medium">Aktuelle Woche</span>
                <span className="block text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                  {thisWeek[0].getDate()}.–{thisWeek[6].getDate()}. {MONTH_NAMES[thisWeek[6].getMonth()]}
                </span>
              </button>
              <div style={{ borderTop: '1px solid #f1f5f9' }} />
              <button
                onClick={() => { exportMonth(year, month, plans, markers, goals); setShowExportMenu(false) }}
                className="w-full text-left px-4 py-3 text-sm transition-colors"
                style={{ color: '#1e293b' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                <span className="font-medium">Aktueller Monat</span>
                <span className="block text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                  {MONTH_NAMES[month]} {year}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {[
          { color: '#bbf7d0', label: 'Vollständig' },
          { color: '#fde68a',  label: 'Teilweise' },
          { color: '#16a34a',  label: 'Fertig ✓', dot: true },
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

                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mb-1"
                  style={isToday ? { background: '#475569', color: 'white' } : isPast && !plan ? { color: '#cbd5e1' } : { color: '#475569' }}>
                  {day.getDate()}
                </span>

                <div className="flex gap-1 mb-1 items-center">
                  {marker?.training   && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#2563eb' }} />}
                  {marker?.eingeladen && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#7c3aed' }} />}
                  {isDayComplete(plan) && <span className="text-[10px] font-bold" style={{ color: '#16a34a' }}>✓</span>}
                </div>

                {plan && plan.kcal_total > 0 && (
                  <div>
                    <div className="text-[10px] font-bold leading-tight" style={{ color: limitColor(plan.kcal_total, goals.kcal) }}>
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
          isComplete={isDayComplete(plans.find(p => p.date === popup))}
          onClose={() => setPopup(null)}
          onMarkerChange={loadAll}
          onAction={(type, dateStr) => { setPopup(null); setTemplateAction({ type, dateStr }) }}
        />
      )}

      {templateAction?.type === 'save' && (
        <SaveDayTemplateModal
          dateStr={templateAction.dateStr}
          onClose={() => setTemplateAction(null)}
          onSaved={() => { setTemplateAction(null) }}
        />
      )}

      {templateAction?.type === 'load' && (
        <LoadTemplateModal
          dateStr={templateAction.dateStr}
          onClose={() => setTemplateAction(null)}
          onLoaded={() => { setTemplateAction(null); loadAll() }}
        />
      )}

      {templateAction?.type === 'copy' && (
        <CopyDayModal
          sourceDate={templateAction.dateStr}
          onClose={() => setTemplateAction(null)}
          onCopied={() => { setTemplateAction(null); loadAll() }}
        />
      )}
    </div>
  )
}
