'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { MONTH_NAMES, DAY_LONG } from '@/lib/dates'
import { limitColor, goalColor } from '@/lib/settings'
import { applyEventRules } from '@/lib/eventRules'

interface Plan   { date: string; kcal_total: number; protein_total: number; cost_total: number; meals?: { meal_type: string }[] }
interface Marker { date: string; training: boolean; eingeladen: boolean }
interface Goals  { kcal: number; protein: number; kosten: number }

export default function DayPopup({ dateStr, plan, marker, goals, isComplete, onClose, onMarkerChange, onAction }: {
  dateStr: string; plan?: Plan; marker?: Marker; goals: Goals; isComplete: boolean
  onClose: () => void; onMarkerChange: () => void
  onAction: (type: 'save' | 'load' | 'copy', dateStr: string) => void
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
    const wasActive = marker?.[field] ?? false
    const nowActive = !wasActive
    await supabase.from('day_markers').upsert({
      date: dateStr,
      training:   field === 'training'   ? nowActive : (marker?.training   ?? false),
      eingeladen: field === 'eingeladen' ? nowActive : (marker?.eingeladen ?? false),
    })
    if (nowActive) {
      await applyEventRules(dateStr, field)
    }
    onMarkerChange()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div ref={ref} className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>

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
          {plan && plan.kcal_total > 0 ? (
            <div className="space-y-3">
              {[
                { label: 'Kalorien', v: Math.round(plan.kcal_total),         max: goals.kcal,    u: 'kcal', limit: true },
                { label: 'Protein',  v: Math.round(plan.protein_total * 10) / 10, max: goals.protein, u: 'g', limit: false },
                { label: 'Kosten',   v: Number(plan.cost_total).toFixed(2),   max: goals.kosten,  u: 'CHF', pre: true, limit: true },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span style={{ color: '#64748b' }}>{s.label}</span>
                    <span className="font-bold" style={{ color: s.limit ? limitColor(Number(s.v), s.max) : goalColor(Number(s.v), s.max) }}>
                      {s.pre ? `CHF ${s.v}` : `${s.v}${s.u}`}
                      {s.max > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}> / {s.max}{s.u}</span>}
                    </span>
                  </div>
                  {s.max > 0 && (
                    <div className="h-1.5 rounded-full" style={{ background: '#f1f5f9' }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.min((Number(s.v) / s.max) * 100, 100)}%`,
                        background: s.limit ? limitColor(Number(s.v), s.max) : goalColor(Number(s.v), s.max),
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

          <div className="pt-1 space-y-2" style={{ borderTop: '1px solid #f1f5f9' }}>
            {([
              { field: 'training'   as const, label: 'Trainingstag', color: '#2563eb', bg: '#eff6ff' },
              { field: 'eingeladen' as const, label: 'Eingeladen / Auswärts', color: '#7c3aed', bg: '#f5f3ff' },
            ]).map(({ field, label: lbl, color, bg }) => (
              <div key={field} className="flex items-center justify-between py-2 px-3 rounded-xl cursor-pointer transition-all"
                style={{ background: marker?.[field] ? bg : '#f8fafc' }}
                onClick={() => toggleMarker(field)}>
                <span className="text-sm font-medium" style={{ color: marker?.[field] ? color : '#94a3b8' }}>{lbl}</span>
                <div className="w-9 h-5 rounded-full relative transition-all"
                  style={{ background: marker?.[field] ? color : '#e2e8f0' }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                    style={{ transform: marker?.[field] ? 'translateX(1.1rem)' : 'translateX(0.125rem)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 space-y-2">
          <button onClick={() => { onClose(); onAction('load', dateStr) }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
            📋 Vorlage laden
          </button>
          {plan && plan.kcal_total > 0 && (
            <button onClick={() => { onClose(); onAction('save', dateStr) }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
              💾 Als Tagesvorlage speichern
            </button>
          )}
          {plan && plan.kcal_total > 0 && (
            <button onClick={() => { onClose(); onAction('copy', dateStr) }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}>
              📑 Tag kopieren nach…
            </button>
          )}
          {isComplete && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: '#f0fdf4' }}>
              <span className="text-sm" style={{ color: '#16a34a' }}>✓ Fertig geplant</span>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2">
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
