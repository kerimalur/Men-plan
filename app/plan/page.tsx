'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getDayView, getPlansInRange, getMarkersInRange, setDayMarker,
  ensurePlan, deleteMeal, deleteMealItem, updateMealItemAmount, createMeal, addMealItems,
  applyDefaultMeals, type DayView,
} from '@/lib/db/plans'
import { setPortionConsumed } from '@/lib/db/cycles'
import type { DayMarker, Meal, MealItem, MealPlan } from '@/lib/db/types'
import { MEAL_TYPE_ORDER, MEAL_TYPE_LABELS, type MealTypeKey } from '@/lib/mealTypes'
import { loadSettings, DEFAULTS } from '@/lib/settings'
import { MONTH_NAMES, DAY_SHORT, toDateStr, getWeekDays } from '@/lib/dates'
import { formatAmount, toBaseUnit } from '@/lib/units'
import { useSwipe } from '@/lib/useSwipe'
import { useToast } from '@/components/Toast'
import MealModal, { type ExistingMeal } from '@/components/MealModal'
import Card, { CardLabel } from '@/components/ui/Card'
import Pill, { MealTypePill } from '@/components/ui/Pill'
import Button, { IconButton } from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'
import Checkbox from '@/components/ui/Checkbox'
import AmountInput from '@/components/ui/AmountInput'

type View = 'tag' | 'woche' | 'monat'

interface Goals { kcal: number; protein: number; kosten: number }

export default function PlanPage() {
  const { toast, toastUndo } = useToast()

  const [view, setView] = useState<View>('tag')
  const [date, setDate] = useState(toDateStr(new Date()))
  const [goals, setGoals] = useState<Goals>({
    kcal: Number(DEFAULTS.kcal_ziel),
    protein: Number(DEFAULTS.protein_ziel),
    kosten: Number(DEFAULTS.kosten_ziel),
  })

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const s = await loadSettings()
      setGoals({ kcal: Number(s.kcal_ziel), protein: Number(s.protein_ziel), kosten: Number(s.kosten_ziel) })
    })
  }, [])

  // Swipe bedeutet überall Zeit vorwärts/rückwärts — nie ein Bereichswechsel.
  const step = view === 'monat' ? 'month' : view === 'woche' ? 'week' : 'day'
  useSwipe({
    onSwipeLeft:  () => setDate(d => shift(d, step, +1)),
    onSwipeRight: () => setDate(d => shift(d, step, -1)),
  })

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="font-display font-normal text-2xl text-text">Plan</h1>
        <Pill variant="accent" onClick={() => setDate(toDateStr(new Date()))}>Heute</Pill>
      </div>

      <SegmentedControl
        className="w-full mb-4"
        segments={[
          { value: 'tag',   label: 'Tag' },
          { value: 'woche', label: 'Woche' },
          { value: 'monat', label: 'Monat' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'tag' && (
        <DayDetail date={date} goals={goals} onDate={setDate} toast={toast} toastUndo={toastUndo} />
      )}
      {view === 'woche' && <WeekView date={date} goals={goals} onPick={d => { setDate(d); setView('tag') }} />}
      {view === 'monat' && <MonthView date={date} goals={goals} onPick={d => { setDate(d); setView('tag') }} />}
    </div>
  )
}

// ── Tagesdetail ─────────────────────────────────────────────────────────────

function DayDetail({ date, goals, onDate, toast, toastUndo }: {
  date: string
  goals: Goals
  onDate: (d: string) => void
  toast: (m: string, t?: 'error' | 'success' | 'info') => void
  toastUndo: (m: string, undo: () => void) => void
}) {
  const [day, setDay] = useState<DayView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<MealTypeKey | null>(null)
  const [editingMeal, setEditingMeal] = useState<ExistingMeal | undefined>(undefined)
  const [editingItem, setEditingItem] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      let view = await getDayView(date)
      // Leerer Tag: Standard-Frühstück (und optional Snack) automatisch setzen.
      // Belegte Slots bleiben unangetastet, das Ergebnis ist pro Tag löschbar.
      if (view.meals.length === 0 && view.portions.length === 0 && !view.marker?.is_free) {
        if (await applyDefaultMeals(date)) view = await getDayView(date)
      }
      setDay(view)
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Tag konnte nicht geladen werden') }
    finally { setLoading(false) }
  }, [date])

  useEffect(() => { setLoading(true); void Promise.resolve().then(load) }, [load])

  if (loading) return <p className="text-sm text-center py-10 text-text-muted">Laden…</p>

  if (error) {
    return (
      <Card className="text-center">
        <p className="text-sm text-danger mb-3">{error}</p>
        <Button variant="secondary" onClick={() => { setLoading(true); void load() }}>Erneut versuchen</Button>
      </Card>
    )
  }

  if (!day) return null

  const isFree = day.marker?.is_free ?? false
  const totals = {
    kcal:    day.plan?.kcal_total ?? 0,
    protein: day.plan?.protein_total ?? 0,
    cost:    Number(day.plan?.cost_total ?? 0),
  }

  const d = new Date(`${date}T12:00:00`)

  async function handleSaveMeal(data: {
    mealName: string
    items: { food_id: string | null; food_name: string; amount: number; unit: string; kcal: number; protein: number; carbs?: number; fat?: number; cost: number }[]
    mealType: string
    existingMealId?: string
  }) {
    try {
      const plan = day!.plan ?? await ensurePlan(date)
      let mealId = data.existingMealId
      if (mealId) {
        await deleteMealItemsFor(mealId)
      } else {
        const meal = await createMeal(plan.id, data.mealType as MealTypeKey, data.mealName)
        mealId = meal.id
      }
      await addMealItems(data.items.map(i => ({ ...i, meal_id: mealId! })))
      setAddingFor(null); setEditingMeal(undefined)
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Speichern fehlgeschlagen', 'error')
    }
  }

  return (
    <>
      {/* Datum + Navigation */}
      <div className="flex items-center justify-between mb-4">
        <IconButton label="Vorheriger Tag" onClick={() => onDate(shift(date, 'day', -1))}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <div className="text-center">
          <p className="font-display font-normal text-lg text-text">
            {d.toLocaleDateString('de-CH', { weekday: 'long' })}
          </p>
          <p className="text-xs text-text-muted">
            {d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <IconButton label="Nächster Tag" onClick={() => onDate(shift(date, 'day', +1))}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </IconButton>
      </div>

      {/* Marker */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <Pill
          variant={day.marker?.training ? 'sage' : 'neutral'}
          onClick={async () => { await setDayMarker(date, { training: !day.marker?.training }); await load() }}
        >Training</Pill>
        <Pill
          variant={day.marker?.eingeladen ? 'warning' : 'neutral'}
          onClick={async () => { await setDayMarker(date, { eingeladen: !day.marker?.eingeladen }); await load() }}
        >Eingeladen</Pill>
        <Pill
          variant={isFree ? 'accent' : 'neutral'}
          onClick={async () => { await setDayMarker(date, { is_free: !isFree }); await load() }}
        >Freier Tag</Pill>
      </div>

      {/* Restbudget: auf freien Tagen prominent */}
      {isFree ? (
        <Card className="mb-4">
          <CardLabel>Noch offen</CardLabel>
          <div className="flex items-baseline gap-4 mt-2">
            <div>
              <span className="font-display font-normal text-3xl text-text">
                {Math.max(0, Math.round(goals.kcal - totals.kcal))}
              </span>
              <span className="text-xs text-text-muted ml-1">kcal</span>
            </div>
            <div>
              <span className="font-display font-normal text-3xl text-text">
                {Math.max(0, Math.round(goals.protein - totals.protein))}
              </span>
              <span className="text-xs text-text-muted ml-1">g Protein</span>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Geplant: {Math.round(totals.kcal)} kcal · {Math.round(totals.protein)} g Protein
          </p>
          <p className="text-xs text-text-faint mt-1">
            Freier Tag — der Zyklus-Planer weist hier keine Boxen zu.
          </p>
        </Card>
      ) : (
        <Card className="mb-4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
            <span className={totals.kcal > goals.kcal ? 'text-danger' : 'text-text-secondary'}>
              {Math.round(totals.kcal)} / {goals.kcal} kcal
            </span>
            <span className={totals.protein >= goals.protein ? 'text-success' : 'text-warning'}>
              {Math.round(totals.protein)} / {goals.protein} g P
            </span>
            <span className={totals.cost > goals.kosten ? 'text-danger' : 'text-text-muted'}>
              CHF {totals.cost.toFixed(2)}
            </span>
          </div>
        </Card>
      )}

      {/* Slots */}
      <div className="flex flex-col gap-3">
        {MEAL_TYPE_ORDER.map(slot => {
          const portions = day.portions.filter(p => p.meal_type === slot)
          const meals = day.meals.filter(m => m.meal_type === slot)
          const empty = portions.length === 0 && meals.length === 0

          return (
            <Card key={slot}>
              <div className="flex items-center justify-between mb-3">
                <MealTypePill mealType={slot} label={MEAL_TYPE_LABELS[slot]} />
                <button
                  onClick={() => { setEditingMeal(undefined); setAddingFor(slot) }}
                  className="tap-inline text-sm font-semibold text-accent"
                >
                  + Hinzufügen
                </button>
              </div>

              {empty && <p className="text-sm text-text-faint">—</p>}

              {/* Vorgekochte Boxen */}
              {portions.map(p => (
                <div key={p.id} className="rounded-inner bg-sage-soft p-3 mb-2">
                  <Checkbox
                    checked={p.consumed}
                    onChange={async v => { await setPortionConsumed(p.id, v); await load() }}
                    label={p.prep_batches.recipes?.name ?? 'Box'}
                    trailing={`${Math.round(p.prep_batches.kcal_per_portion)} kcal`}
                  />
                  <p className="text-[11px] text-text-muted pl-8">
                    Box aus dem Kühlschrank · {Math.round(p.prep_batches.protein_per_portion)} g Protein
                  </p>
                </div>
              ))}

              {/* Frei geplante Mahlzeiten */}
              {meals.map(meal => (
                <MealBlock
                  key={meal.id}
                  meal={meal}
                  editingItem={editingItem}
                  setEditingItem={setEditingItem}
                  onReload={load}
                  onEdit={() => {
                    setEditingMeal({
                      id: meal.id, name: meal.name, meal_type: meal.meal_type,
                      items: (meal.meal_items ?? []).map(i => ({
                        food_id: i.food_id, food_name: i.food_name, amount: i.amount, unit: i.unit,
                        kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat, cost: i.cost,
                      })),
                    })
                    setAddingFor(slot)
                  }}
                  onDelete={async () => {
                    const snapshot = meal
                    await deleteMeal(meal.id)
                    await load()
                    toastUndo(`„${snapshot.name}" gelöscht`, async () => {
                      try {
                        const plan = day.plan ?? await ensurePlan(date)
                        const restored = await createMeal(plan.id, snapshot.meal_type, snapshot.name)
                        await addMealItems((snapshot.meal_items ?? []).map(i => ({
                          meal_id: restored.id, food_id: i.food_id, food_name: i.food_name,
                          amount: i.amount, unit: i.unit, kcal: i.kcal, protein: i.protein,
                          carbs: i.carbs, fat: i.fat, cost: i.cost,
                        })))
                        await load()
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'Wiederherstellen fehlgeschlagen', 'error')
                      }
                    })
                  }}
                />
              ))}
            </Card>
          )
        })}
      </div>

      {addingFor && (
        <MealModal
          mealType={addingFor}
          existingMeal={editingMeal}
          onClose={() => { setAddingFor(null); setEditingMeal(undefined) }}
          onSave={handleSaveMeal}
        />
      )}
    </>
  )
}

async function deleteMealItemsFor(mealId: string) {
  const { deleteMealItems } = await import('@/lib/db/plans')
  await deleteMealItems(mealId)
}

// ── Mahlzeiten-Block mit Inline-Mengenbearbeitung ───────────────────────────

function MealBlock({ meal, editingItem, setEditingItem, onReload, onEdit, onDelete }: {
  meal: Meal
  editingItem: string | null
  setEditingItem: (id: string | null) => void
  onReload: () => Promise<void>
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const items = meal.meal_items ?? []

  return (
    <div className="rounded-inner bg-surface-alt p-3 mb-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-display font-normal text-base text-text flex-1 min-w-0">{meal.name}</p>
        <button onClick={onEdit} className="tap-inline text-xs text-accent px-1">Bearbeiten</button>
        <button onClick={onDelete} aria-label="Mahlzeit löschen" className="tap-inline text-text-faint hover:text-danger px-1">×</button>
      </div>

      <ul>
        {items.map(item => {
          const base = toBaseUnit(item.amount, item.unit)
          return (
            <li key={item.id} className="border-b border-border-soft last:border-0 py-1.5">
              {editingItem === item.id ? (
                <div>
                  <p className="text-sm text-text mb-2">{item.food_name}</p>
                  <AmountInput
                    value={item.amount}
                    unit={item.unit}
                    onCommit={async v => {
                      setEditingItem(null)
                      if (v > 0 && v !== item.amount) {
                        await updateMealItemAmount(item as MealItem, v)
                        await onReload()
                      }
                    }}
                    onCancel={() => setEditingItem(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-text-secondary min-w-0">{item.food_name}</span>
                  <button
                    onClick={() => setEditingItem(item.id)}
                    className="tap-inline text-sm text-text-muted px-2 py-0.5 rounded-button hover:bg-border-soft"
                  >
                    {formatAmount(base.amount, base.unit)}
                  </button>
                  <button
                    onClick={async () => { await deleteMealItem(item.id); await onReload() }}
                    aria-label={`${item.food_name} entfernen`}
                    className="tap-inline text-text-faint hover:text-danger px-1"
                  >×</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex gap-3 mt-2 text-xs font-semibold text-text-secondary">
        <span>{Math.round(meal.kcal_total)} kcal</span>
        <span>{Math.round(meal.protein_total)} g P</span>
        {meal.carbs_total > 0 && <span>{Math.round(meal.carbs_total)} g KH</span>}
        {meal.fat_total > 0 && <span>{Math.round(meal.fat_total)} g Fett</span>}
      </div>
    </div>
  )
}

// ── Wochenübersicht ─────────────────────────────────────────────────────────

function WeekView({ date, goals, onPick }: { date: string; goals: Goals; onPick: (d: string) => void }) {
  const [plans, setPlans] = useState<MealPlan[]>([])
  const [markers, setMarkers] = useState<DayMarker[]>([])
  const days = useMemo(() => getWeekDays(new Date(`${date}T12:00:00`)).map(toDateStr), [date])

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const [p, m] = await Promise.all([
        getPlansInRange(days[0], days[6]),
        getMarkersInRange(days[0], days[6]),
      ])
      setPlans(p); setMarkers(m)
    })
  }, [days])

  const byDate = new Map(plans.map(p => [p.date, p]))
  const markerByDate = new Map(markers.map(m => [m.date, m]))
  const filled = plans.filter(p => p.kcal_total > 0)

  return (
    <>
      <Card className="mb-4">
        <CardLabel>Wochenschnitt</CardLabel>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm font-semibold text-text-secondary">
          <span>{filled.length ? Math.round(filled.reduce((s, p) => s + p.kcal_total, 0) / filled.length) : 0} kcal</span>
          <span>{filled.length ? Math.round(filled.reduce((s, p) => s + p.protein_total, 0) / filled.length) : 0} g P</span>
          <span>CHF {plans.reduce((s, p) => s + Number(p.cost_total), 0).toFixed(2)}</span>
          <span className="text-text-faint">{filled.length}/7 Tage geplant</span>
        </div>
      </Card>

      <div className="flex flex-col gap-2">
        {days.map((d, i) => {
          const p = byDate.get(d)
          const kcal = p?.kcal_total ?? 0
          const pct = goals.kcal > 0 ? Math.min(kcal / goals.kcal, 1) : 0
          const free = markerByDate.get(d)?.is_free
          return (
            <Card key={d} nested onClick={() => onPick(d)} className="!py-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-text">
                  {DAY_SHORT[i]} {new Date(`${d}T12:00:00`).getDate()}.
                </span>
                <div className="flex items-center gap-2">
                  {free && <Pill variant="neutral">frei</Pill>}
                  <span className={`text-sm font-semibold ${kcal > goals.kcal ? 'text-danger' : 'text-text-secondary'}`}>
                    {Math.round(kcal)} kcal
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-pill bg-border overflow-hidden">
                <div
                  className={`h-full rounded-pill ${kcal > goals.kcal ? 'bg-danger' : 'bg-success'}`}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}

// ── Monatskalender ──────────────────────────────────────────────────────────

function MonthView({ date, goals, onPick }: { date: string; goals: Goals; onPick: (d: string) => void }) {
  const cursor = new Date(`${date}T12:00:00`)
  const [month, setMonth] = useState({ y: cursor.getFullYear(), m: cursor.getMonth() })
  const [plans, setPlans] = useState<MealPlan[]>([])

  const first = new Date(month.y, month.m, 1)
  const last = new Date(month.y, month.m + 1, 0)

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setPlans(await getPlansInRange(toDateStr(first), toDateStr(last)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.y, month.m])

  const byDate = new Map(plans.map(p => [p.date, p]))
  const todayStr = toDateStr(new Date())

  // Montag als erster Wochentag.
  const leading = (first.getDay() + 6) % 7
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: last.getDate() }, (_, i) => toDateStr(new Date(month.y, month.m, i + 1))),
  ]

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <IconButton label="Vorheriger Monat" onClick={() => setMonth(s => s.m === 0 ? { y: s.y - 1, m: 11 } : { ...s, m: s.m - 1 })}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <span className="font-display font-normal text-lg text-text">
          {MONTH_NAMES[month.m]} {month.y}
        </span>
        <IconButton label="Nächster Monat" onClick={() => setMonth(s => s.m === 11 ? { y: s.y + 1, m: 0 } : { ...s, m: s.m + 1 })}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </IconButton>
      </div>

      <div className="flex gap-3 mb-3 text-[11px] text-text-muted">
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-success inline-block" /> vollständig</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-warning inline-block" /> teilweise</span>
      </div>

      <Card>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_SHORT.map(d => (
            <span key={d} className="text-center text-[11px] text-text-muted">{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`e${i}`} />
            const p = byDate.get(d)
            const kcal = p?.kcal_total ?? 0
            const isToday = d === todayStr
            const complete = kcal >= goals.kcal * 0.9
            const partial = kcal > 0 && !complete

            const cls = isToday
              ? 'bg-text text-surface'
              : complete
                ? 'bg-success-soft text-text'
                : partial
                  ? 'bg-warning-soft text-text'
                  : 'bg-transparent text-text-muted'

            return (
              <button
                key={d}
                onClick={() => onPick(d)}
                className={`aspect-square rounded-inner flex flex-col items-center justify-center min-h-11 ${cls}`}
              >
                <span className="text-sm font-semibold">{new Date(`${d}T12:00:00`).getDate()}</span>
                {kcal > 0 && (
                  <span className={`text-[9px] ${isToday ? 'text-surface-alt' : 'text-text-muted'}`}>
                    {Math.round(kcal)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Card>
    </>
  )
}

// ── Hilfen ──────────────────────────────────────────────────────────────────

function shift(dateStr: string, unit: 'day' | 'week' | 'month', delta: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  if (unit === 'day') d.setDate(d.getDate() + delta)
  if (unit === 'week') d.setDate(d.getDate() + delta * 7)
  if (unit === 'month') d.setMonth(d.getMonth() + delta)
  return toDateStr(d)
}
