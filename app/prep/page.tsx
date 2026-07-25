'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  listCycles, createCycle, deleteCycle, setCycleStatus,
  updateBatchPortions, datesBetween, freeDatesIn, perPortionValues,
} from '@/lib/db/cycles'
import type { CycleStatus, PrepCycle, Recipe } from '@/lib/db/types'
import { MEAL_TYPE_LABELS, type MealTypeKey } from '@/lib/mealTypes'
import { loadSettings, DEFAULTS } from '@/lib/settings'
import { toDateStr, DAY_SHORT } from '@/lib/dates'
import type { Nutrition } from '@/lib/calculations'
import { useToast } from '@/components/Toast'
import RecipePicker from '@/components/RecipePicker'
import RecipeEditModal from '@/components/RecipeEditModal'
import Card, { CardLabel } from '@/components/ui/Card'
import Pill from '@/components/ui/Pill'
import Button, { IconButton } from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'
import AmountInput from '@/components/ui/AmountInput'

const STATUS_LABELS: Record<CycleStatus, string> = {
  geplant:    'Geplant',
  eingekauft: 'Eingekauft',
  gekocht:    'Gekocht',
  erledigt:   'Erledigt',
}

const STATUS_VARIANT: Record<CycleStatus, 'warning' | 'sage' | 'accent' | 'success'> = {
  geplant:    'warning',
  eingekauft: 'sage',
  gekocht:    'accent',
  erledigt:   'success',
}

/** Ein Topf im Planer, bevor er gespeichert ist. */
interface DraftBatch {
  key: string
  recipe: Recipe
  mealType: MealTypeKey
  portions: number
  per: Nutrition
}

export default function PrepPage() {
  const { toast } = useToast()
  const [cycles, setCycles] = useState<PrepCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try { setCycles(await listCycles()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Zyklen konnten nicht geladen werden') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  if (planning) {
    return <CyclePlanner onCancel={() => setPlanning(false)} onSaved={async () => { setPlanning(false); await load() }} />
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-normal text-2xl text-text">Prep</h1>
        <Button onClick={() => setPlanning(true)}>+ Zyklus</Button>
      </div>

      {loading && <p className="text-sm text-center py-10 text-text-muted">Laden…</p>}

      {error && (
        <Card className="text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); void load() }}>Erneut versuchen</Button>
        </Card>
      )}

      {!loading && !error && cycles.length === 0 && (
        <Card className="text-center">
          <p className="text-sm text-text-muted mb-1">Noch kein Kochzyklus geplant.</p>
          <p className="text-xs text-text-faint">
            Ein Zyklus deckt 2 oder 3 Tage ab: ein Mittag- und ein Abendgericht, in Portionen gekocht und auf Boxen verteilt.
          </p>
        </Card>
      )}

      <div className="grid gap-3">
        {cycles.map(c => (
          <CycleCard
            key={c.id}
            cycle={c}
            onStatus={async (s) => { await setCycleStatus(c.id, s); await load() }}
            onDelete={async () => {
              try { await deleteCycle(c.id); await load(); toast('Zyklus gelöscht', 'success') }
              catch (e) { toast(e instanceof Error ? e.message : 'Löschen fehlgeschlagen', 'error') }
            }}
            onPortionsChanged={load}
          />
        ))}
      </div>
    </div>
  )
}

// ── Zyklus-Karte ────────────────────────────────────────────────────────────

function CycleCard({ cycle, onStatus, onDelete, onPortionsChanged }: {
  cycle: PrepCycle
  onStatus: (s: CycleStatus) => Promise<void>
  onDelete: () => Promise<void>
  onPortionsChanged: () => Promise<void>
}) {
  const { toast } = useToast()
  const [editingBatch, setEditingBatch] = useState<string | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<{ id: string; name: string; portions: number } | null>(null)
  const batches = cycle.prep_batches ?? []
  const days = datesBetween(cycle.start_date, cycle.end_date)

  const cost = batches.reduce((s, b) => s + b.cost_per_portion * b.portions, 0)

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="font-display font-normal text-base text-text">
            {cycle.name || `Kochtag ${fmtShort(cycle.cook_date)}`}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            {fmtShort(cycle.start_date)} – {fmtShort(cycle.end_date)} · {days.length} Tage
          </p>
        </div>
        <Pill variant={STATUS_VARIANT[cycle.status]}>{STATUS_LABELS[cycle.status]}</Pill>
      </div>

      <div className="flex flex-col gap-2 mb-3">
        {batches.map(b => (
          <div key={b.id} className="rounded-inner bg-surface-alt p-3">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setEditingRecipe({
                  id: b.recipe_id,
                  name: b.recipes?.name ?? 'Rezept',
                  portions: b.portions,
                })}
                className="tap-inline min-w-0 text-left px-1 -mx-1 rounded-button hover:bg-border-soft"
              >
                <p className="text-sm text-text truncate">{b.recipes?.name ?? 'Rezept'}</p>
                <p className="text-[11px] text-text-muted">{MEAL_TYPE_LABELS[b.meal_type]} · Zutaten bearbeiten</p>
              </button>
              {editingBatch === b.id ? (
                <div className="w-40">
                  <AmountInput
                    value={b.portions}
                    unit="Boxen"
                    integer
                    onCommit={async v => {
                      setEditingBatch(null)
                      if (v === b.portions || v < 1) return
                      try { await updateBatchPortions(b.id, v); await onPortionsChanged() }
                      catch (e) { toast(e instanceof Error ? e.message : 'Speichern fehlgeschlagen', 'error') }
                    }}
                    onCancel={() => setEditingBatch(null)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingBatch(b.id)}
                  className="tap-inline text-right px-2 py-1 rounded-button hover:bg-border-soft"
                >
                  <span className="font-display font-normal text-xl text-text">{b.portions}</span>
                  <span className="text-[11px] text-text-muted ml-1">Boxen</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary mb-3">
        <span className="font-semibold">CHF {cost.toFixed(2)} gesamt</span>
        <span className="text-text-muted">{batches.reduce((s, b) => s + b.portions, 0)} Boxen</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/prep/${cycle.id}/kochen`} className="flex-1">
          <Button fullWidth>Kochliste</Button>
        </Link>
        {cycle.status === 'geplant' && (
          <Button variant="secondary" onClick={() => onStatus('eingekauft')}>Eingekauft</Button>
        )}
        {cycle.status === 'gekocht' && (
          <Button variant="secondary" onClick={() => onStatus('erledigt')}>Erledigt</Button>
        )}
        <IconButton label="Zyklus löschen" variant="danger" onClick={onDelete}>×</IconButton>
      </div>

      {editingRecipe && (
        <RecipeEditModal
          recipeId={editingRecipe.id}
          recipeName={editingRecipe.name}
          portions={editingRecipe.portions}
          onClose={async changed => {
            setEditingRecipe(null)
            // Die Werte pro Portion zieht der DB-Trigger nach — hier nur neu laden.
            if (changed) await onPortionsChanged()
          }}
        />
      )}
    </Card>
  )
}

// ── Zyklus-Planer ───────────────────────────────────────────────────────────

function CyclePlanner({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => Promise<void> }) {
  const { toast } = useToast()
  const today = toDateStr(new Date())

  const [cookDate, setCookDate] = useState(today)
  const [numDays, setNumDays] = useState<'2' | '3'>('3')
  const [drafts, setDrafts] = useState<DraftBatch[]>([])
  const [pickingFor, setPickingFor] = useState<MealTypeKey | null>(null)
  const [freeDays, setFreeDays] = useState<Set<string>>(new Set())
  const [goals, setGoals] = useState({ kcal: Number(DEFAULTS.kcal_ziel), protein: Number(DEFAULTS.protein_ziel) })
  const [saving, setSaving] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<DraftBatch | null>(null)

  const days = useMemo(() => {
    const start = cookDate
    const end = toDateStr(addDays(new Date(`${cookDate}T12:00:00`), Number(numDays) - 1))
    return datesBetween(start, end)
  }, [cookDate, numDays])

  const usableDays = days.filter(d => !freeDays.has(d))

  useEffect(() => {
    void Promise.resolve().then(async () => {
      setFreeDays(await freeDatesIn(days))
    })
  }, [days])

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const s = await loadSettings()
      setGoals({ kcal: Number(s.kcal_ziel), protein: Number(s.protein_ziel) })
    })
  }, [])

  async function addBatch(recipe: Recipe, mealType: MealTypeKey) {
    try {
      const per = await perPortionValues(recipe.id)
      setDrafts(prev => [...prev, {
        key: `${recipe.id}-${mealType}-${prev.length}`,
        recipe,
        mealType,
        portions: Math.min(usableDays.length || Number(numDays), recipe.default_portions || Number(numDays)),
        per,
      }])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Rezept konnte nicht geladen werden', 'error')
    }
    setPickingFor(null)
  }

  /**
   * Vorschau: eine Box pro Tag und Slot, freie Tage übersprungen.
   * Dieselbe Verteilung wendet createCycle beim Speichern an.
   */
  const perDay = useMemo(() => {
    const map = new Map<string, { kcal: number; protein: number; cost: number; labels: string[] }>()
    for (const d of days) map.set(d, { kcal: 0, protein: 0, cost: 0, labels: [] })
    for (const b of drafts) {
      usableDays.slice(0, b.portions).forEach(d => {
        const e = map.get(d)!
        e.kcal += b.per.kcal
        e.protein += b.per.protein
        e.cost += b.per.cost
        e.labels.push(b.recipe.name)
      })
    }
    return map
  }, [days, usableDays, drafts])

  async function save() {
    if (drafts.length === 0) return
    setSaving(true)
    try {
      await createCycle({
        cook_date: cookDate,
        start_date: days[0],
        end_date: days[days.length - 1],
        batches: drafts.map(d => ({ recipe_id: d.recipe.id, meal_type: d.mealType, portions: d.portions })),
      })
      toast('Zyklus angelegt', 'success')
      await onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Zyklus konnte nicht angelegt werden', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-5">
        <IconButton label="Abbrechen" onClick={onCancel}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <h1 className="font-display font-normal text-2xl text-text">Zyklus planen</h1>
      </div>

      {/* 1. Zeitraum */}
      <Card className="mb-4">
        <CardLabel>Zeitraum</CardLabel>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-secondary">Kochtag</span>
            <input
              type="date"
              value={cookDate}
              onChange={e => setCookDate(e.target.value)}
              className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-secondary">Deckt ab</span>
            <SegmentedControl
              segments={[{ value: '2', label: '2 Tage' }, { value: '3', label: '3 Tage' }]}
              value={numDays}
              onChange={setNumDays}
            />
          </div>
          {freeDays.size > 0 && (
            <p className="text-xs text-text-muted">
              {freeDays.size} freier Tag im Zeitraum wird bei der Verteilung übersprungen.
            </p>
          )}
        </div>
      </Card>

      {/* 2./3. Rezepte und Portionen */}
      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <CardLabel>Töpfe</CardLabel>
          <div className="flex gap-2">
            <Pill variant="accent" onClick={() => setPickingFor('mittagessen')}>+ Mittag</Pill>
            <Pill variant="accent" onClick={() => setPickingFor('abendessen')}>+ Abend</Pill>
          </div>
        </div>

        {drafts.length === 0 && (
          <p className="text-sm text-text-faint py-2">Noch kein Rezept gewählt.</p>
        )}

        <div className="flex flex-col gap-2">
          {drafts.map(d => (
            <div key={d.key} className="rounded-inner bg-surface-alt p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <button
                  onClick={() => setEditingDraft(d)}
                  className="tap-inline min-w-0 text-left px-1 -mx-1 rounded-button hover:bg-border-soft"
                >
                  <p className="text-sm text-text">{d.recipe.name}</p>
                  <p className="text-[11px] text-text-muted">{MEAL_TYPE_LABELS[d.mealType]} · Zutaten bearbeiten</p>
                </button>
                <button
                  onClick={() => setDrafts(prev => prev.filter(x => x.key !== d.key))}
                  aria-label="Topf entfernen"
                  className="tap-inline text-text-faint hover:text-danger px-1"
                >
                  ×
                </button>
              </div>

              {editingKey === d.key ? (
                <AmountInput
                  value={d.portions}
                  unit="Boxen"
                  integer
                  onCommit={v => {
                    setEditingKey(null)
                    setDrafts(prev => prev.map(x => x.key === d.key ? { ...x, portions: Math.max(1, v) } : x))
                  }}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                <button
                  onClick={() => setEditingKey(d.key)}
                  className="tap-inline flex items-baseline gap-1 px-2 py-1 rounded-button hover:bg-border-soft"
                >
                  <span className="font-display font-normal text-xl text-text">{d.portions}</span>
                  <span className="text-[11px] text-text-muted">Boxen à {Math.round(d.per.kcal)} kcal</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 4./6. Verteilung und Live-Vorschau */}
      {drafts.length > 0 && (
        <Card className="mb-4">
          <CardLabel>Vorschau pro Tag</CardLabel>
          <div className="mt-3 flex flex-col gap-2">
            {days.map(d => {
              const e = perDay.get(d)!
              const isFree = freeDays.has(d)
              const overKcal = e.kcal > goals.kcal
              const underProtein = e.protein < goals.protein
              return (
                <div key={d} className="rounded-inner bg-surface-alt p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-text">
                      {DAY_SHORT[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]} {fmtShort(d)}
                    </span>
                    {isFree ? (
                      <Pill variant="neutral">frei</Pill>
                    ) : (
                      <span className="text-xs text-text-muted">{e.labels.length} Boxen</span>
                    )}
                  </div>
                  {!isFree && (
                    <div className="flex flex-wrap gap-x-3 text-xs font-semibold">
                      <span className={overKcal ? 'text-danger' : 'text-text-secondary'}>
                        {Math.round(e.kcal)} / {goals.kcal} kcal
                      </span>
                      <span className={underProtein ? 'text-warning' : 'text-success'}>
                        {Math.round(e.protein)} / {goals.protein} g P
                      </span>
                      <span className="text-text-muted">CHF {e.cost.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-text-faint mt-3">
            Frühstück kommt aus der Standard-Mahlzeit und ist hier nicht mitgerechnet.
          </p>
        </Card>
      )}

      <Button fullWidth onClick={save} disabled={drafts.length === 0 || saving}>
        {saving ? 'Speichern…' : 'Zyklus anlegen'}
      </Button>

      {pickingFor && (
        <RecipePicker
          mealType={pickingFor}
          usedIds={drafts.map(d => d.recipe.id)}
          onPick={r => addBatch(r, pickingFor)}
          onClose={() => setPickingFor(null)}
        />
      )}

      {editingDraft && (
        <RecipeEditModal
          recipeId={editingDraft.recipe.id}
          recipeName={editingDraft.recipe.name}
          portions={editingDraft.portions}
          onClose={async changed => {
            const draft = editingDraft
            setEditingDraft(null)
            // Der Entwurf ist noch kein Topf — die Werte pro Portion neu holen,
            // damit die Tagesvorschau stimmt.
            if (!changed) return
            try {
              const per = await perPortionValues(draft.recipe.id)
              setDrafts(prev => prev.map(x => x.recipe.id === draft.recipe.id ? { ...x, per } : x))
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Rezept konnte nicht neu geladen werden', 'error')
            }
          }}
        />
      )}
    </div>
  )
}

// ── Hilfen ──────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

function fmtShort(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('de-CH', { day: 'numeric', month: 'short' })
}
