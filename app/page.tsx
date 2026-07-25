'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getDayView, type DayView } from '@/lib/db/plans'
import { setPortionConsumed, getPortionsForRange } from '@/lib/db/cycles'
import { MEAL_TYPE_ORDER, MEAL_TYPE_LABELS, MEAL_TYPE_BG, type MealTypeKey } from '@/lib/mealTypes'
import { loadSettings, DEFAULTS } from '@/lib/settings'
import { toDateStr } from '@/lib/dates'
import { useSwipe } from '@/lib/useSwipe'
import Card, { CardLabel } from '@/components/ui/Card'
import Pill, { MealTypePill } from '@/components/ui/Pill'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import StatCard, { StatCardGrid } from '@/components/ui/StatCard'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Guten Morgen'
  if (h < 17) return 'Guten Tag'
  return 'Guten Abend'
}

export default function HeutePage() {
  const [date, setDate] = useState(toDateStr(new Date()))
  const [day, setDay] = useState<DayView | null>(null)
  const [fridge, setFridge] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [goals, setGoals] = useState({
    kcal: Number(DEFAULTS.kcal_ziel),
    protein: Number(DEFAULTS.protein_ziel),
    kosten: Number(DEFAULTS.kosten_ziel),
  })

  // Swipe: Zeit vorwärts/rückwärts, kein Bereichswechsel.
  useSwipe({
    onSwipeLeft:  () => setDate(d => shiftDay(d, +1)),
    onSwipeRight: () => setDate(d => shiftDay(d, -1)),
  })

  const load = useCallback(async () => {
    setError(null)
    try {
      const today = toDateStr(new Date())
      const [view, portions] = await Promise.all([
        getDayView(date),
        // Noch nicht gegessene Boxen ab heute — was im Kühlschrank steht.
        getPortionsForRange(today, shiftDay(today, 14)),
      ])
      setDay(view)
      setFridge(portions.filter(p => !p.consumed).length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tag konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { setLoading(true); void Promise.resolve().then(load) }, [load])

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const s = await loadSettings()
      setGoals({ kcal: Number(s.kcal_ziel), protein: Number(s.protein_ziel), kosten: Number(s.kosten_ziel) })
    })
  }, [])

  const isToday = date === toDateStr(new Date())
  const d = new Date(`${date}T12:00:00`)

  const totals = {
    kcal:    day?.plan?.kcal_total ?? 0,
    protein: day?.plan?.protein_total ?? 0,
    cost:    Number(day?.plan?.cost_total ?? 0),
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-5">
        <p className="text-sm text-text-muted">{isToday ? greeting() : 'Tagesplan'}</p>
        <h1 className="font-display font-normal text-2xl text-text">
          {d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h1>
      </div>

      {loading && <p className="text-sm text-center py-10 text-text-muted">Laden…</p>}

      {error && (
        <Card className="text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); void load() }}>Erneut versuchen</Button>
        </Card>
      )}

      {!loading && !error && day && (
        <>
          {/* Kennzahlen: horizontale Balken statt Kreisbögen */}
          <StatCardGrid>
            <StatCard label="Kalorien" value={totals.kcal} max={goals.kcal} unit="kcal" kind="limit" />
            <StatCard label="Protein"  value={totals.protein} max={goals.protein} unit="g" kind="goal" />
            <StatCard label="Kosten"   value={totals.cost} max={goals.kosten} unit="" kind="limit" decimals={2} />
          </StatCardGrid>

          {/* Restbudget */}
          <Card className="mt-4">
            <CardLabel>Noch offen</CardLabel>
            <div className="flex items-baseline gap-5 mt-2">
              <div>
                <span className="font-display font-normal text-2xl text-text">
                  {Math.max(0, Math.round(goals.kcal - totals.kcal))}
                </span>
                <span className="text-xs text-text-muted ml-1">kcal</span>
              </div>
              <div>
                <span className="font-display font-normal text-2xl text-text">
                  {Math.max(0, Math.round(goals.protein - totals.protein))}
                </span>
                <span className="text-xs text-text-muted ml-1">g Protein</span>
              </div>
            </div>
            {fridge > 0 && (
              <p className="text-xs text-sage font-semibold mt-3">
                Noch {fridge} {fridge === 1 ? 'Portion' : 'Portionen'} im Kühlschrank
              </p>
            )}
          </Card>

          {/* Heutiger Menüplan */}
          <Card className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <CardLabel>Heutiger Menüplan</CardLabel>
              <Link href="/plan" className="tap-inline text-sm font-semibold text-accent">Öffnen</Link>
            </div>

            <ul>
              {MEAL_TYPE_ORDER.map(slot => {
                const portions = day.portions.filter(p => p.meal_type === slot)
                const meals = day.meals.filter(m => m.meal_type === slot)
                const empty = portions.length === 0 && meals.length === 0

                return (
                  <li key={slot} className="border-b border-border-soft last:border-0 py-2">
                    {empty ? (
                      <div className="flex items-center gap-3 min-h-11">
                        <Dot slot={slot} />
                        <span className="w-24 shrink-0 text-xs text-text-muted">{MEAL_TYPE_LABELS[slot]}</span>
                        <span className="flex-1 text-sm text-text-faint">—</span>
                      </div>
                    ) : (
                      <>
                        {portions.map(p => (
                          <div key={p.id} className="flex items-center gap-3">
                            <Dot slot={slot} />
                            <span className="w-24 shrink-0 text-xs text-text-muted">{MEAL_TYPE_LABELS[slot]}</span>
                            <div className="flex-1 min-w-0">
                              <Checkbox
                                checked={p.consumed}
                                onChange={async v => { await setPortionConsumed(p.id, v); await load() }}
                                label={p.prep_batches.recipes?.name ?? 'Box'}
                                trailing={`${Math.round(p.prep_batches.kcal_per_portion)} kcal`}
                              />
                            </div>
                          </div>
                        ))}
                        {meals.map(m => (
                          <div key={m.id} className="flex items-center gap-3 min-h-11">
                            <Dot slot={slot} />
                            <span className="w-24 shrink-0 text-xs text-text-muted">{MEAL_TYPE_LABELS[slot]}</span>
                            <span className="flex-1 text-sm text-text min-w-0">{m.name}</span>
                            <span className="text-sm text-text-muted shrink-0">{Math.round(m.kcal_total)} kcal</span>
                          </div>
                        ))}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>

          {day.marker?.is_free && (
            <Card className="mt-4">
              <MealTypePill mealType="snack" label="Freier Tag" />
              <p className="text-sm text-text-muted mt-2">
                Kein Meal Prep eingeplant. Trag einzelne Mahlzeiten unter „Plan“ ein.
              </p>
            </Card>
          )}

          <div className="flex gap-2 mt-4">
            <Link href="/prep" className="flex-1"><Button fullWidth>Prep planen</Button></Link>
            <Link href="/einkaufsliste" className="flex-1"><Button variant="secondary" fullWidth>Einkauf</Button></Link>
          </div>

          {!isToday && (
            <div className="mt-4 text-center">
              <Pill variant="accent" onClick={() => setDate(toDateStr(new Date()))}>Zurück zu heute</Pill>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Dot({ slot }: { slot: MealTypeKey }) {
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${MEAL_TYPE_BG[slot]}`} />
}

function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return toDateStr(d)
}
