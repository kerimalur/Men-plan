'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadSettings, goalColor } from '@/lib/settings'
import { applyEventRules } from '@/lib/eventRules'
import { useSwipe } from '@/lib/useSwipe'

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const DAY_LONG  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

interface Plan   { date: string; kcal_total: number; protein_total: number; cost_total: number; meals?: { meal_type: string }[] }
interface Marker { date: string; training: boolean; eingeladen: boolean }
interface Goals  { kcal: number; protein: number }

const REQUIRED_MEALS = ['fruehstueck', 'mittagessen', 'abendessen', 'snack']
function isDayComplete(plan?: Plan) {
  if (!plan?.meals) return false
  const types = new Set(plan.meals.map(m => m.meal_type))
  return REQUIRED_MEALS.every(t => types.has(t))
}

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

function buildExportHtml(
  title: string,
  rows: { label: string; dateStr: string; plan?: Plan; marker?: Marker }[],
  goals: Goals
) {
  const filled = rows.filter(r => r.plan && r.plan.kcal_total > 0)
  const totalKcal = filled.reduce((s, r) => s + (r.plan?.kcal_total ?? 0), 0)
  const totalProtein = filled.reduce((s, r) => s + (r.plan?.protein_total ?? 0), 0)
  const totalCost = filled.reduce((s, r) => s + (r.plan?.cost_total ?? 0), 0)
  const avgKcal = filled.length ? totalKcal / filled.length : 0

  function kcalColor(v: number) {
    if (!v) return '#94a3b8'
    const pct = v / goals.kcal
    if (pct >= 0.95) return '#16a34a'
    if (pct >= 0.6)  return '#d97706'
    return '#dc2626'
  }

  const rowsHtml = rows.map(({ label, plan, marker }) => {
    const v = plan?.kcal_total ?? 0
    const pct = v ? Math.min((v / goals.kcal) * 100, 100) : 0
    const barW = Math.round(pct)
    const color = kcalColor(v)
    const badges = [
      marker?.training   ? '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:99px;font-size:11px;margin-right:4px">🏋️ Training</span>' : '',
      marker?.eingeladen ? '<span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:99px;font-size:11px">🍽 Eingeladen</span>' : '',
    ].join('')
    return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle">
        <div style="font-weight:600;font-size:13px;color:#1e293b">${label}</div>
        ${badges ? `<div style="margin-top:4px">${badges}</div>` : ''}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle">
        ${v ? `<span style="font-weight:700;color:${color};font-size:14px">${Math.round(v)}</span><span style="color:#94a3b8;font-size:12px"> kcal</span>` : '<span style="color:#cbd5e1;font-size:12px">–</span>'}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle;color:#475569;font-size:13px">
        ${plan ? `${Math.round((plan.protein_total ?? 0) * 10) / 10}g` : '–'}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle;color:#475569;font-size:13px">
        ${plan ? `CHF ${Number(plan.cost_total).toFixed(2)}` : '–'}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle;width:100px">
        ${v ? `
        <div style="background:#f1f5f9;border-radius:99px;height:6px">
          <div style="background:${color};border-radius:99px;height:6px;width:${barW}%"></div>
        </div>
        <div style="font-size:10px;color:#94a3b8;margin-top:3px;text-align:right">${Math.round(pct)}%</div>
        ` : ''}
      </td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; padding: 2rem }
  .card { background: white; border-radius: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.08); overflow: hidden }
  .header { background: linear-gradient(135deg, #475569 0%, #334155 100%); padding: 24px 28px; color: white }
  .header h1 { font-size: 18px; font-weight: 800; margin-bottom: 4px }
  .header p { font-size: 13px; opacity: 0.75 }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-bottom: 1px solid #f1f5f9 }
  .stat { padding: 16px 20px; text-align: center; border-right: 1px solid #f1f5f9 }
  .stat:last-child { border-right: none }
  .stat-value { font-size: 22px; font-weight: 800; color: #1e293b }
  .stat-label { font-size: 11px; color: #94a3b8; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em }
  table { width: 100%; border-collapse: collapse }
  thead th { background: #f8fafc; padding: 10px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #94a3b8; text-align: left; border-bottom: 2px solid #e2e8f0 }
  thead th:not(:first-child) { text-align: right }
  @media print { body { padding: 0.5rem; background: white } .card { box-shadow: none } }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>${title}</h1>
    <p>${filled.length} von ${rows.length} Tagen mit Daten · Ziel: ${goals.kcal} kcal / ${goals.protein}g Protein</p>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-value">${Math.round(avgKcal)}<span style="font-size:13px;font-weight:400;color:#94a3b8"> kcal</span></div><div class="stat-label">Ø Kalorien/Tag</div></div>
    <div class="stat"><div class="stat-value">${Math.round(totalProtein * 10) / 10}<span style="font-size:13px;font-weight:400;color:#94a3b8"> g</span></div><div class="stat-label">Protein gesamt</div></div>
    <div class="stat"><div class="stat-value">CHF ${totalCost.toFixed(2)}</div><div class="stat-label">Kosten gesamt</div></div>
    <div class="stat"><div class="stat-value">${filled.length}/${rows.length}</div><div class="stat-label">Tage geplant</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Tag</th><th style="text-align:right">Kalorien</th><th style="text-align:right">Protein</th><th style="text-align:right">Kosten</th><th style="text-align:right">Fortschritt</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</div>
<script>window.print()</script>
</body></html>`
}

function exportWeek(days: Date[], plans: Plan[], markers: Marker[], goals: Goals) {
  const title = `Wochenübersicht · ${days[0].toLocaleDateString('de-CH', { day: 'numeric', month: 'long' })} – ${days[6].toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}`
  const rows = days.map(d => {
    const ds = toDateStr(d)
    return {
      label: `${DAY_LONG[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`,
      dateStr: ds,
      plan: plans.find(p => p.date === ds),
      marker: markers.find(m => m.date === ds),
    }
  })
  const html = buildExportHtml(title, rows, goals)
  const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
}

function exportMonth(year: number, month: number, plans: Plan[], markers: Marker[], goals: Goals) {
  const lastDay = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: lastDay }, (_, i) => new Date(year, month, i + 1))
  const monthName = MONTH_NAMES[month]
  const title = `Monatsübersicht · ${monthName} ${year}`
  const rows = days.map(d => {
    const ds = toDateStr(d)
    return {
      label: `${DAY_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}. ${monthName}`,
      dateStr: ds,
      plan: plans.find(p => p.date === ds),
      marker: markers.find(m => m.date === ds),
    }
  })
  const html = buildExportHtml(title, rows, goals)
  const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
}

// ── Day Popup ─────────────────────────────────────────────────
function DayPopup({ dateStr, plan, marker, goals, isComplete, onClose, onMarkerChange, onAction }: {
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

        <div className="px-5 space-y-2">
          {/* Vorlage laden */}
          <button onClick={() => { onClose(); onAction('load', dateStr) }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
            📋 Vorlage laden
          </button>

          {/* Save as template (only if day has data) */}
          {plan && plan.kcal_total > 0 && (
            <button onClick={() => { onClose(); onAction('save', dateStr) }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
              💾 Als Tagesvorlage speichern
            </button>
          )}

          {/* Copy day (only if day has data) */}
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

// ── Save Day as Template Modal ────────────────────────────────
function SaveDayTemplateModal({ dateStr, onClose, onSaved }: {
  dateStr: string; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data: planData } = await supabase.from('meal_plans').select('id').eq('date', dateStr).single()
    if (!planData) { setSaving(false); return }
    const { data: meals } = await supabase.from('meals').select('*, meal_items(*)').eq('plan_id', planData.id)
    if (!meals?.length) { setSaving(false); return }

    const { data: template } = await supabase.from('plan_templates').insert({ name: name.trim(), type: 'day' }).select().single()
    if (!template) { setSaving(false); return }
    const { data: templateDay } = await supabase.from('plan_template_days').insert({ template_id: template.id, day_offset: 0 }).select().single()
    if (!templateDay) { setSaving(false); return }

    for (const meal of meals) {
      const { data: tmplMeal } = await supabase.from('plan_template_meals').insert({
        template_day_id: templateDay.id, meal_type: meal.meal_type, name: meal.name
      }).select().single()
      if (tmplMeal && meal.meal_items?.length) {
        await supabase.from('plan_template_items').insert(
          meal.meal_items.map((i: { food_id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }) => ({
            template_meal_id: tmplMeal.id, food_id: i.food_id, food_name: i.food_name,
            amount: i.amount, unit: i.unit, kcal: i.kcal, protein: i.protein, cost: i.cost,
          }))
        )
      }
    }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Tag als Vorlage speichern</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg" style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs" style={{ color: '#64748b' }}>
            Alle Mahlzeiten vom <span className="font-semibold">{new Date(dateStr + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}</span> werden als Tagesvorlage gespeichert.
          </p>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name der Vorlage"
            onKeyDown={e => e.key === 'Enter' && save()}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={save} disabled={!name.trim() || saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#4f46e5' }}>{saving ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Load Template Modal ───────────────────────────────────────
interface PlanTemplate {
  id: string; name: string; type: 'day' | 'week'; created_at: string
  plan_template_days: {
    id: string; day_offset: number
    plan_template_meals: {
      id: string; meal_type: string; name: string
      plan_template_items: { id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }[]
    }[]
  }[]
}

function LoadTemplateModal({ dateStr, onClose, onLoaded }: {
  dateStr: string; onClose: () => void; onLoaded: () => void
}) {
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)
  const [tab, setTab] = useState<'day' | 'week'>('day')

  useEffect(() => {
    supabase.from('plan_templates')
      .select('*, plan_template_days(*, plan_template_meals(*, plan_template_items(*)))')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setTemplates((data as PlanTemplate[]) || []); setLoading(false) })
  }, [])

  async function apply(template: PlanTemplate) {
    setApplying(template.id)
    for (const day of template.plan_template_days || []) {
      const dateObj = new Date(dateStr + 'T12:00:00')
      dateObj.setDate(dateObj.getDate() + day.day_offset)
      const dayStr = toDateStr(dateObj)

      let planId: string
      const { data: existing } = await supabase.from('meal_plans').select('id').eq('date', dayStr).maybeSingle()
      if (existing) {
        planId = existing.id
      } else {
        const { data: created } = await supabase.from('meal_plans').insert({ date: dayStr, kcal_total: 0, protein_total: 0, cost_total: 0 }).select().single()
        planId = created!.id
      }

      for (const meal of day.plan_template_meals || []) {
        const items = meal.plan_template_items || []
        const totals = items.reduce((acc, i) => ({
          kcal: acc.kcal + Number(i.kcal), protein: acc.protein + Number(i.protein), cost: acc.cost + Number(i.cost)
        }), { kcal: 0, protein: 0, cost: 0 })

        const { data: newMeal } = await supabase.from('meals').insert({
          plan_id: planId, meal_type: meal.meal_type, name: meal.name,
          kcal_total: totals.kcal, protein_total: totals.protein, cost_total: totals.cost
        }).select().single()

        if (newMeal && items.length) {
          await supabase.from('meal_items').insert(items.map(i => ({
            meal_id: newMeal.id, food_id: null, food_name: i.food_name,
            amount: i.amount, unit: i.unit, kcal: i.kcal, protein: i.protein, cost: i.cost
          })))
        }
      }

      // Recalculate
      const { data: allMeals } = await supabase.from('meals').select('kcal_total,protein_total,cost_total').eq('plan_id', planId)
      const t = (allMeals || []).reduce((acc, m) => ({
        kcal: acc.kcal + Number(m.kcal_total), protein: acc.protein + Number(m.protein_total), cost: acc.cost + Number(m.cost_total)
      }), { kcal: 0, protein: 0, cost: 0 })
      await supabase.from('meal_plans').update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost }).eq('id', planId)
    }
    setApplying(null); onLoaded()
  }

  const dayTemplates = templates.filter(t => t.type === 'day')
  const weekTemplates = templates.filter(t => t.type === 'week')
  const currentList = tab === 'day' ? dayTemplates : weekTemplates

  const targetLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl overflow-hidden shadow-xl" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Vorlage laden</h3>
            <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
              {tab === 'day' ? `Für ${targetLabel}` : `Ab ${targetLabel} (7 Tage)`}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg" style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 mx-5 mt-3 rounded-xl" style={{ background: '#f1f5f9' }}>
          {([['day', 'Tagesplan'] as const, ['week', 'Wochenplan'] as const]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-1 py-2 text-xs rounded-lg font-semibold transition-all"
              style={tab === key ? { background: 'white', color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: '#94a3b8' }}>
              {label} ({key === 'day' ? dayTemplates.length : weekTemplates.length})
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && <p className="text-center text-sm py-8" style={{ color: '#94a3b8' }}>Laden…</p>}
          {!loading && currentList.length === 0 && (
            <p className="text-center text-sm py-8" style={{ color: '#94a3b8' }}>
              Keine {tab === 'day' ? 'Tages' : 'Wochen'}vorlagen vorhanden.
            </p>
          )}
          {currentList.map(tmpl => {
            const allMeals = tmpl.plan_template_days.flatMap(d => d.plan_template_meals || [])
            const allItems = allMeals.flatMap(m => m.plan_template_items || [])
            const totalKcal = allItems.reduce((s, i) => s + Number(i.kcal), 0)
            const totalProtein = allItems.reduce((s, i) => s + Number(i.protein), 0)
            const daysCount = tmpl.plan_template_days.length

            return (
              <div key={tmpl.id} className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{tmpl.name}</span>
                    <div className="flex gap-3 mt-1 text-xs" style={{ color: '#64748b' }}>
                      <span>{Math.round(totalKcal)} kcal</span>
                      <span>{Math.round(totalProtein * 10) / 10}g P</span>
                      {tmpl.type === 'week' && <span>{daysCount} Tage</span>}
                      <span>{allMeals.length} Mahlzeiten</span>
                    </div>
                  </div>
                  <button onClick={() => apply(tmpl)} disabled={applying !== null}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                    style={{ background: '#16a34a' }}>
                    {applying === tmpl.id ? 'Laden…' : 'Anwenden'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {allMeals.map(m => (
                    <span key={m.id} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#e2e8f0', color: '#475569' }}>
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Copy Day Modal ────────────────────────────────────────────
function CopyDayModal({ sourceDate, onClose, onCopied }: {
  sourceDate: string; onClose: () => void; onCopied: () => void
}) {
  const [targetDate, setTargetDate] = useState('')
  const [copying, setCopying] = useState(false)

  async function copy() {
    if (!targetDate || targetDate === sourceDate) return
    setCopying(true)

    const { data: sourcePlan } = await supabase.from('meal_plans').select('id').eq('date', sourceDate).single()
    if (!sourcePlan) { setCopying(false); return }
    const { data: meals } = await supabase.from('meals').select('*, meal_items(*)').eq('plan_id', sourcePlan.id)
    if (!meals?.length) { setCopying(false); return }

    let targetPlanId: string
    const { data: existing } = await supabase.from('meal_plans').select('id').eq('date', targetDate).maybeSingle()
    if (existing) {
      targetPlanId = existing.id
    } else {
      const { data: created } = await supabase.from('meal_plans').insert({ date: targetDate, kcal_total: 0, protein_total: 0, cost_total: 0 }).select().single()
      targetPlanId = created!.id
    }

    for (const meal of meals) {
      const { data: newMeal } = await supabase.from('meals').insert({
        plan_id: targetPlanId, meal_type: meal.meal_type, name: meal.name,
        kcal_total: meal.kcal_total, protein_total: meal.protein_total, cost_total: meal.cost_total
      }).select().single()
      if (newMeal && meal.meal_items?.length) {
        await supabase.from('meal_items').insert(
          meal.meal_items.map((i: { food_id: string | null; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }) => ({
            meal_id: newMeal.id, food_id: i.food_id, food_name: i.food_name,
            amount: i.amount, unit: i.unit, kcal: i.kcal, protein: i.protein, cost: i.cost
          }))
        )
      }
    }

    const { data: allMeals } = await supabase.from('meals').select('kcal_total,protein_total,cost_total').eq('plan_id', targetPlanId)
    const t = (allMeals || []).reduce((acc, m) => ({
      kcal: acc.kcal + Number(m.kcal_total), protein: acc.protein + Number(m.protein_total), cost: acc.cost + Number(m.cost_total)
    }), { kcal: 0, protein: 0, cost: 0 })
    await supabase.from('meal_plans').update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost }).eq('id', targetPlanId)

    setCopying(false); onCopied()
  }

  const sourceLabel = new Date(sourceDate + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Tag kopieren</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg" style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs" style={{ color: '#64748b' }}>
            Alle Mahlzeiten vom <span className="font-semibold">{sourceLabel}</span> werden kopiert nach:
          </p>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={copy} disabled={!targetDate || targetDate === sourceDate || copying}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#d97706' }}>{copying ? 'Kopieren…' : 'Kopieren'}</button>
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
    const start = toDateStr(new Date(year, month, 1))
    const end   = toDateStr(new Date(year, month + 1, 0))
    const [planRes, markerRes, settingsData] = await Promise.all([
      supabase.from('meal_plans').select('date,kcal_total,protein_total,cost_total,meals(meal_type)').gte('date', start).lte('date', end),
      supabase.from('day_markers').select('date,training,eingeladen').gte('date', start).lte('date', end),
      loadSettings(),
    ])
    setPlans(planRes.data || [])
    setMarkers(markerRes.data || [])
    setGoals({ kcal: parseInt(settingsData.kcal_ziel) || 2000, protein: parseInt(settingsData.protein_ziel) || 150 })
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

                {/* Number */}
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold mb-1"
                  style={isToday ? { background: '#475569', color: 'white' } : isPast && !plan ? { color: '#cbd5e1' } : { color: '#475569' }}>
                  {day.getDate()}
                </span>

                {/* Marker dots + complete check */}
                <div className="flex gap-1 mb-1 items-center">
                  {marker?.training   && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#2563eb' }} />}
                  {marker?.eingeladen && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#7c3aed' }} />}
                  {isDayComplete(plan) && <span className="text-[10px] font-bold" style={{ color: '#16a34a' }}>✓</span>}
                </div>

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
          isComplete={isDayComplete(plans.find(p => p.date === popup))}
          onClose={() => setPopup(null)}
          onMarkerChange={loadAll}
          onAction={(type, dateStr) => { setPopup(null); setTemplateAction({ type, dateStr }) }}
        />
      )}

      {/* Save Day Template Modal */}
      {templateAction?.type === 'save' && (
        <SaveDayTemplateModal
          dateStr={templateAction.dateStr}
          onClose={() => setTemplateAction(null)}
          onSaved={() => { setTemplateAction(null) }}
        />
      )}

      {/* Load Template Modal */}
      {templateAction?.type === 'load' && (
        <LoadTemplateModal
          dateStr={templateAction.dateStr}
          onClose={() => setTemplateAction(null)}
          onLoaded={() => { setTemplateAction(null); loadAll() }}
        />
      )}

      {/* Copy Day Modal */}
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
