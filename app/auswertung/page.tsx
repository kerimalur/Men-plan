'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getDaySeries, toWeekBuckets, topRecipes, topFoods, type DayPoint } from '@/lib/db/analytics'
import { foodValueRanking } from '@/lib/db/foods'
import { loadSettings, DEFAULTS } from '@/lib/settings'
import { DAY_SHORT } from '@/lib/dates'
import Card, { CardLabel } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'

type Span = '8' | '12'

export default function AuswertungPage() {
  const [span, setSpan] = useState<Span>('8')
  const [days, setDays] = useState<DayPoint[]>([])
  const [recipes, setRecipes] = useState<Array<{ name: string; count: number }>>([])
  const [foods, setFoods] = useState<Array<{ name: string; count: number }>>([])
  const [proteinValue, setProteinValue] = useState<Array<{ id: string; name: string; value: number }>>([])
  const [kcalValue, setKcalValue] = useState<Array<{ id: string; name: string; value: number }>>([])
  const [goals, setGoals] = useState({
    kcal: Number(DEFAULTS.kcal_ziel),
    protein: Number(DEFAULTS.protein_ziel),
    kosten: Number(DEFAULTS.kosten_ziel),
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [d, s, r, f, pv, kv] = await Promise.all([
        getDaySeries(Number(span)),
        loadSettings(),
        topRecipes(),
        topFoods(),
        foodValueRanking('protein', 10),
        foodValueRanking('kcal', 10),
      ])
      setDays(d)
      setGoals({ kcal: Number(s.kcal_ziel), protein: Number(s.protein_ziel), kosten: Number(s.kosten_ziel) })
      setRecipes(r); setFoods(f); setProteinValue(pv); setKcalValue(kv)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auswertung konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [span])

  useEffect(() => { setLoading(true); void Promise.resolve().then(load) }, [load])

  const weeks = useMemo(() => toWeekBuckets(days), [days])
  const planned = days.filter(d => d.kcal > 0)

  const avgKcal    = planned.length ? planned.reduce((s, d) => s + d.kcal, 0) / planned.length : 0
  const avgProtein = planned.length ? planned.reduce((s, d) => s + d.protein, 0) / planned.length : 0
  const avgCost    = planned.length ? planned.reduce((s, d) => s + d.cost, 0) / planned.length : 0

  // Vergleich Meal-Prep-Tage gegen freie Tage
  const prepDays = planned.filter(d => d.isPrep)
  const freeDays = planned.filter(d => !d.isPrep)

  if (loading) return <p className="text-sm text-center py-10 text-text-muted">Laden…</p>

  if (error) {
    return (
      <div className="max-w-lg mx-auto">
        <Card className="text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); void load() }}>Erneut versuchen</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-display font-normal text-2xl text-text mb-4">Auswertung</h1>

      <SegmentedControl
        className="w-full mb-4"
        segments={[{ value: '8', label: '8 Wochen' }, { value: '12', label: '12 Wochen' }]}
        value={span}
        onChange={setSpan}
      />

      {planned.length === 0 && (
        <Card className="text-center">
          <p className="text-sm text-text-muted">Noch keine geplanten Tage im Zeitraum.</p>
        </Card>
      )}

      {planned.length > 0 && (
        <>
          {/* Schnitt */}
          <Card className="mb-4">
            <CardLabel>Tagesschnitt · {planned.length} geplante Tage</CardLabel>
            <div className="mt-3 flex flex-col gap-2">
              <Metric label="Kalorien" value={Math.round(avgKcal)}    goal={goals.kcal}    unit="kcal" kind="limit" />
              <Metric label="Protein"  value={Math.round(avgProtein)} goal={goals.protein} unit="g"    kind="goal" />
              <Metric label="Kosten"   value={round2(avgCost)}        goal={goals.kosten}  unit="CHF"  kind="limit" />
            </div>
          </Card>

          {/* Verlauf */}
          <Card className="mb-4">
            <CardLabel>Kalorien pro Woche</CardLabel>
            <LineChart
              points={weeks.map(w => w.kcal)}
              labels={weeks.map(w => w.label)}
              goal={goals.kcal}
            />
          </Card>

          <Card className="mb-4">
            <CardLabel>Kosten pro Woche</CardLabel>
            <LineChart
              points={weeks.map(w => w.cost)}
              labels={weeks.map(w => w.label)}
              format={v => `CHF ${v.toFixed(0)}`}
            />
          </Card>

          {/* Heatmap */}
          <Card className="mb-4">
            <CardLabel>Zielerreichung nach Wochentag</CardLabel>
            <p className="text-xs text-text-muted mt-1 mb-3">
              Anteil der Tage, an denen das Proteinziel erreicht wurde.
            </p>
            <Heatmap days={planned} goalProtein={goals.protein} />
          </Card>

          {/* Prep vs. frei */}
          <Card className="mb-4">
            <CardLabel>Meal Prep gegen freie Tage</CardLabel>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Compare title="Mit Prep" days={prepDays} goals={goals} />
              <Compare title="Ohne Prep" days={freeDays} goals={goals} />
            </div>
          </Card>
        </>
      )}

      {/* Rankings */}
      <Card className="mb-4">
        <CardLabel>Protein pro Franken</CardLabel>
        <Ranking rows={proteinValue} unit="g / CHF" />
      </Card>

      <Card className="mb-4">
        <CardLabel>Kalorien pro Franken</CardLabel>
        <Ranking rows={kcalValue} unit="kcal / CHF" />
      </Card>

      {recipes.length > 0 && (
        <Card className="mb-4">
          <CardLabel>Meistgekochte Rezepte · 90 Tage</CardLabel>
          <Ranking rows={recipes.map(r => ({ id: r.name, name: r.name, value: r.count }))} unit="×" />
        </Card>
      )}

      {foods.length > 0 && (
        <Card>
          <CardLabel>Meistverwendete Lebensmittel · 90 Tage</CardLabel>
          <Ranking rows={foods.map(f => ({ id: f.name, name: f.name, value: f.count }))} unit="×" />
        </Card>
      )}
    </div>
  )
}

// ── Bausteine ───────────────────────────────────────────────────────────────

function Metric({ label, value, goal, unit, kind }: {
  label: string; value: number; goal: number; unit: string; kind: 'goal' | 'limit'
}) {
  const pct = goal > 0 ? Math.round((value / goal) * 100) : 0
  const good = kind === 'limit' ? value <= goal : value >= goal
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="font-display font-normal text-lg text-text">{value}</span>
        <span className="text-xs text-text-muted">{unit}</span>
        <span className={`text-xs font-semibold ${good ? 'text-success' : 'text-danger'}`}>{pct}%</span>
      </span>
    </div>
  )
}

/**
 * Schlichtes Liniendiagramm als SVG — bewusst ohne Chart-Bibliothek,
 * das Projekt soll keine zusätzliche Laufzeit-Abhängigkeit bekommen.
 */
function LineChart({ points, labels, goal, format }: {
  points: number[]
  labels: string[]
  goal?: number
  format?: (v: number) => string
}) {
  if (points.length === 0) return <p className="text-sm text-text-faint mt-3">Keine Daten.</p>

  const W = 320, H = 120, PAD = 8
  const max = Math.max(...points, goal ?? 0) * 1.1 || 1
  const stepX = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2)

  const path = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * stepX} ${y(v)}`)
    .join(' ')

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Verlauf">
        {goal !== undefined && (
          <line
            x1={PAD} x2={W - PAD} y1={y(goal)} y2={y(goal)}
            stroke="var(--color-border)" strokeWidth={1} strokeDasharray="4 4"
          />
        )}
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((v, i) => (
          <circle key={i} cx={PAD + i * stepX} cy={y(v)} r={3} fill="var(--color-accent)" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-text-faint">{labels[0]}</span>
        <span className="text-[10px] text-text-muted font-semibold">
          {format ? format(points[points.length - 1]) : Math.round(points[points.length - 1])}
        </span>
        <span className="text-[10px] text-text-faint">{labels[labels.length - 1]}</span>
      </div>
    </div>
  )
}

function Heatmap({ days, goalProtein }: { days: DayPoint[]; goalProtein: number }) {
  // Index 0 = Montag.
  const buckets = Array.from({ length: 7 }, () => ({ hit: 0, total: 0 }))
  for (const d of days) {
    const idx = (new Date(`${d.date}T12:00:00`).getDay() + 6) % 7
    buckets[idx].total++
    if (d.protein >= goalProtein) buckets[idx].hit++
  }

  return (
    <div className="grid grid-cols-7 gap-1">
      {buckets.map((b, i) => {
        const pct = b.total > 0 ? b.hit / b.total : 0
        const cls = b.total === 0 ? 'bg-surface-alt'
          : pct >= 0.75 ? 'bg-success'
          : pct >= 0.4  ? 'bg-warning'
          : 'bg-danger'
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-text-muted">{DAY_SHORT[i]}</span>
            <div className={`w-full aspect-square rounded-inner ${cls}`} />
            <span className="text-[9px] text-text-faint">
              {b.total > 0 ? `${Math.round(pct * 100)}%` : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Compare({ title, days, goals }: {
  title: string
  days: DayPoint[]
  goals: { kcal: number; protein: number; kosten: number }
}) {
  if (days.length === 0) {
    return (
      <div className="rounded-inner bg-surface-alt p-3">
        <CardLabel>{title}</CardLabel>
        <p className="text-xs text-text-faint mt-2">Keine Tage</p>
      </div>
    )
  }
  const hit = days.filter(d => d.protein >= goals.protein).length
  const cost = days.reduce((s, d) => s + d.cost, 0) / days.length
  return (
    <div className="rounded-inner bg-surface-alt p-3">
      <CardLabel>{title}</CardLabel>
      <p className="font-display font-normal text-xl text-text mt-2">
        {Math.round((hit / days.length) * 100)}%
      </p>
      <p className="text-[11px] text-text-muted">Proteinziel erreicht</p>
      <p className="text-xs text-text-secondary mt-2 font-semibold">CHF {round2(cost)} / Tag</p>
      <p className="text-[11px] text-text-faint">{days.length} Tage</p>
    </div>
  )
}

function Ranking({ rows, unit }: { rows: Array<{ id: string; name: string; value: number }>; unit: string }) {
  if (rows.length === 0) return <p className="text-sm text-text-faint mt-3">Keine Daten.</p>
  const max = Math.max(...rows.map(r => r.value)) || 1
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {rows.map(r => (
        <li key={r.id}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-text-secondary truncate">{r.name}</span>
            <span className="text-xs font-semibold text-text-muted shrink-0 ml-2">
              {r.value} {unit}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-pill bg-border overflow-hidden">
            <div className="h-full rounded-pill bg-sage" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
