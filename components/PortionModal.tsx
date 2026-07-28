'use client'

import { useEffect, useState } from 'react'
import { movePortion, addPortion, deletePortion, listFridgeBatches, type FridgeBatch } from '@/lib/db/cycles'
import { MEAL_TYPE_ORDER, MEAL_TYPE_LABELS, type MealTypeKey } from '@/lib/mealTypes'
import { toDateStr, DAY_LONG } from '@/lib/dates'
import { useToast } from '@/components/Toast'
import Button from '@/components/ui/Button'
import SegmentedControl from '@/components/ui/SegmentedControl'

/**
 * Boxen eines Tages bearbeiten.
 *
 * Zwei Fälle, dasselbe Fenster:
 *   'move' — eine bereits zugewiesene Box auf einen anderen Tag oder in einen
 *            anderen Slot legen, oder ganz aus dem Tag nehmen.
 *   'add'  — eine freie Box aus dem Kühlschrank diesem Tag zuweisen.
 *
 * Der Prep-Zyklus bleibt in beiden Fällen unangetastet: gekocht ist gekocht,
 * nur die Tageszuordnung ändert sich.
 */
export type PortionModalMode = 'move' | 'add'

interface Props {
  mode: PortionModalMode
  /** Tag, um den es geht. */
  date: string
  /** Nur bei 'move': die Box, die bearbeitet wird. */
  portion?: { id: string; name: string; meal_type: MealTypeKey }
  /** Nur bei 'add': in welchen Slot die Box zuerst gelegt werden soll. */
  slot?: MealTypeKey
  onClose: () => void
  onDone: () => void
}

function longDate(d: string): string {
  const date = new Date(`${d}T12:00:00`)
  return `${DAY_LONG[(date.getDay() + 6) % 7]}, ${date.getDate()}. ${date.getMonth() + 1}.`
}

export default function PortionModal({ mode, date, portion, slot, onClose, onDone }: Props) {
  const { toast } = useToast()

  const [target, setTarget] = useState(date)
  const [mealType, setMealType] = useState<MealTypeKey>(portion?.meal_type ?? slot ?? 'mittagessen')
  const [busy, setBusy] = useState(false)
  const [fridge, setFridge] = useState<FridgeBatch[] | null>(null)
  const [pickedBatch, setPickedBatch] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'add') return
    void Promise.resolve().then(async () => {
      try { setFridge(await listFridgeBatches()) }
      catch { setFridge([]) }
    })
  }, [mode])

  async function run() {
    if (busy) return
    setBusy(true)
    try {
      if (mode === 'move') {
        if (!portion) return
        await movePortion(portion.id, target, mealType)
        toast(
          target === date
            ? `„${portion.name}" nach ${MEAL_TYPE_LABELS[mealType]} verschoben`
            : `„${portion.name}" auf ${longDate(target)} verschoben`,
          'success',
        )
      } else {
        if (!pickedBatch) { setBusy(false); return }
        const b = fridge?.find(f => f.batchId === pickedBatch)
        await addPortion(pickedBatch, target, mealType)
        toast(`„${b?.recipeName ?? 'Box'}" auf ${longDate(target)} gelegt`, 'success')
      }
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Speichern fehlgeschlagen', 'error')
      setBusy(false)
    }
  }

  async function remove() {
    if (!portion || busy) return
    setBusy(true)
    try {
      await deletePortion(portion.id)
      toast(`„${portion.name}" aus dem Tag entfernt`, 'success')
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Entfernen fehlgeschlagen', 'error')
      setBusy(false)
    }
  }

  const nichtsGewaehlt = mode === 'add' && !pickedBatch

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-text/30 backdrop-blur-sm">
      <div className="w-full sm:max-w-md max-h-[88vh] flex flex-col bg-surface rounded-t-card sm:rounded-card border border-border shadow-float">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-soft">
          <h2 className="font-display font-normal text-lg text-text">
            {mode === 'move' ? 'Box verschieben' : 'Box aus dem Kühlschrank'}
          </h2>
          <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {mode === 'move' && portion && (
            <p className="text-sm text-text-secondary">
              <span className="font-semibold text-text">{portion.name}</span> vom {longDate(date)}
            </p>
          )}

          {/* Kühlschrank-Auswahl */}
          {mode === 'add' && (
            <div>
              <span className="block mb-1.5 text-[11px] uppercase tracking-[0.08em] font-semibold text-text-muted">
                Welche Box?
              </span>
              {!fridge && <p className="text-sm text-text-muted py-2">Laden…</p>}
              {fridge?.length === 0 && (
                <p className="text-sm text-text-faint py-2">
                  Keine Zyklen der letzten Woche gefunden.
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                {fridge?.map(b => {
                  const on = pickedBatch === b.batchId
                  return (
                    <button
                      key={b.batchId}
                      onClick={() => { setPickedBatch(b.batchId); setMealType(b.mealType) }}
                      aria-pressed={on}
                      className={`text-left px-3 py-2.5 rounded-inner border ${
                        on ? 'border-accent bg-accent-soft' : 'border-border bg-surface-alt'
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-text truncate">{b.recipeName}</span>
                        <span className={`text-xs shrink-0 ${b.free > 0 ? 'text-success' : 'text-text-faint'}`}>
                          {b.free > 0 ? `${b.free} frei` : 'alle verteilt'}
                        </span>
                      </span>
                      <span className="block text-[11px] text-text-muted mt-0.5">
                        {MEAL_TYPE_LABELS[b.mealType]} · {b.cycleName} ·{' '}
                        {Math.round(b.kcalPerPortion)} kcal je Box
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-text-faint">
                Auch komplett verteilte Töpfe lassen sich wählen — die zusätzliche Box
                wird dann eben doppelt gegessen oder anderswo abgezogen.
              </p>
            </div>
          )}

          {/* Zieltag */}
          <div>
            <label htmlFor="portion-target" className="block text-[11px] uppercase tracking-[0.08em] font-semibold text-text-muted mb-1.5">
              Tag
            </label>
            <input
              id="portion-target"
              type="date"
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="w-full min-h-11 px-3 rounded-button bg-surface-alt border border-border text-sm text-text"
            />
          </div>

          {/* Slot */}
          <div>
            <span className="block mb-1.5 text-[11px] uppercase tracking-[0.08em] font-semibold text-text-muted">
              Mahlzeit
            </span>
            <SegmentedControl
              className="w-full"
              segments={MEAL_TYPE_ORDER.map(s => ({ value: s, label: MEAL_TYPE_LABELS[s] }))}
              value={mealType}
              onChange={setMealType}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-border-soft">
          {mode === 'move' && (
            <Button variant="danger" onClick={remove} disabled={busy}>
              Aus dem Tag nehmen
            </Button>
          )}
          <Button fullWidth onClick={run} disabled={busy || nichtsGewaehlt}>
            {busy ? '…' : mode === 'move' ? 'Verschieben' : 'Hinzufügen'}
          </Button>
        </div>
      </div>
    </div>
  )
}
