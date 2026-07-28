'use client'

import { useEffect, useState } from 'react'
import { getDayView, transferDayEntries } from '@/lib/db/plans'
import { MEAL_TYPE_ORDER, MEAL_TYPE_LABELS, type MealTypeKey } from '@/lib/mealTypes'
import { toDateStr, DAY_LONG } from '@/lib/dates'
import { useToast } from '@/components/Toast'
import Button from '@/components/ui/Button'
import { MealTypePill } from '@/components/ui/Pill'

export type CopyDayMode = 'copy' | 'move'

interface Props {
  /** Quelltag, aus dem übertragen wird. */
  date: string
  /** Voreinstellung ist bewusst 'copy' — der zerstörungsfreie Fall. */
  mode?: CopyDayMode
  onClose: () => void
  /** Läuft nach erfolgreicher Übertragung; die Kalenderdaten lädt der Aufrufer neu. */
  onDone: (target: string) => void
}

/** Eine auswählbare Zeile: freie Mahlzeit oder vorgekochte Box. */
interface Entry {
  kind: 'meal' | 'portion'
  id: string
  slot: MealTypeKey
  name: string
  kcal: number
}

const TEXTS: Record<CopyDayMode, { title: string; verb: string; action: string; hint: string }> = {
  copy: {
    title:  'Tag kopieren',
    verb:   'werden kopiert nach:',
    action: 'Kopieren',
    hint:   'Ein bereits geplanter Zieltag wird ergänzt, nicht ersetzt.',
  },
  move: {
    title:  'Tag verschieben',
    verb:   'werden verschoben nach:',
    action: 'Verschieben',
    hint:   'Das Ausgewählte verschwindet vom Quelltag. Ein bereits geplanter Zieltag wird ergänzt, nicht ersetzt.',
  },
}

function longDate(d: string): string {
  const date = new Date(`${d}T12:00:00`)
  return `${DAY_LONG[(date.getDay() + 6) % 7]}, ${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}`
}

export default function CopyDayModal({ date, mode = 'copy', onClose, onDone }: Props) {
  const { toast } = useToast()
  const t = TEXTS[mode]

  const tomorrow = new Date(`${date}T12:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [target, setTarget] = useState(toDateStr(tomorrow))
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // Alles vorausgewählt: der häufige Fall ist der ganze Tag, das Abwählen
  // einzelner Mahlzeiten die Ausnahme.
  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const day = await getDayView(date)
        const list: Entry[] = []
        for (const slot of MEAL_TYPE_ORDER) {
          for (const p of day.portions.filter(p => p.meal_type === slot)) {
            list.push({
              kind: 'portion', id: p.id, slot,
              name: p.prep_batches.recipes?.name ?? 'Box',
              kcal: Number(p.prep_batches.kcal_per_portion),
            })
          }
          for (const m of day.meals.filter(m => m.meal_type === slot)) {
            list.push({ kind: 'meal', id: m.id, slot, name: m.name, kcal: Number(m.kcal_total) })
          }
        }
        setEntries(list)
        setPicked(new Set(list.map(e => `${e.kind}:${e.id}`)))
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Tag konnte nicht geladen werden')
        onClose()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const sameDay = target === date
  const nothingPicked = picked.size === 0

  function toggle(e: Entry) {
    const key = `${e.kind}:${e.id}`
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function run() {
    if (sameDay || nothingPicked || busy || !entries) return
    setBusy(true)
    try {
      const res = await transferDayEntries(date, target, mode, {
        mealIds:    entries.filter(e => e.kind === 'meal'    && picked.has(`meal:${e.id}`)).map(e => e.id),
        portionIds: entries.filter(e => e.kind === 'portion' && picked.has(`portion:${e.id}`)).map(e => e.id),
      })

      const moved = res.meals + res.portions
      const verb = mode === 'move' ? 'verschoben' : 'kopiert'
      toast(
        res.skippedPortions > 0
          ? `${moved} ${moved === 1 ? 'Eintrag' : 'Einträge'} ${verb}. ${res.skippedPortions} Box(en) übersprungen — am Zieltag liegt im selben Slot schon eine Box aus demselben Topf.`
          : `${moved} ${moved === 1 ? 'Eintrag' : 'Einträge'} ${verb}.`,
        res.skippedPortions > 0 ? 'info' : 'success',
      )
      onDone(target)
    }
    catch (e) {
      toast(e instanceof Error ? e.message : 'Übertragen fehlgeschlagen')
      setBusy(false)
    }
  }

  const allPicked = entries !== null && picked.size === entries.length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-text/30 backdrop-blur-sm">
      <div className="w-full sm:max-w-md max-h-[88vh] flex flex-col bg-surface rounded-t-card sm:rounded-card border border-border shadow-float">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-soft">
          <h2 className="font-display font-normal text-lg text-text">{t.title}</h2>
          <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-text-secondary">
            Vom <span className="font-semibold text-text">{longDate(date)}</span> {t.verb}
          </p>

          <div>
            <label htmlFor="copy-day-target" className="block text-[11px] uppercase tracking-[0.08em] font-semibold text-text-muted mb-1.5">
              Zieldatum
            </label>
            <input
              id="copy-day-target"
              type="date"
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="w-full min-h-11 px-3 rounded-button bg-surface-alt border border-border text-sm text-text"
            />
            {sameDay && (
              <p className="mt-1.5 text-xs text-danger">Ziel- und Quelltag sind identisch.</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-text-muted">
                Was übertragen?
              </span>
              {entries && entries.length > 1 && (
                <button
                  onClick={() => setPicked(allPicked ? new Set() : new Set(entries.map(e => `${e.kind}:${e.id}`)))}
                  className="tap-inline text-xs font-semibold text-accent"
                >
                  {allPicked ? 'Keine' : 'Alle'}
                </button>
              )}
            </div>

            {!entries && <p className="text-sm text-text-muted py-2">Laden…</p>}
            {entries?.length === 0 && (
              <p className="text-sm text-text-faint py-2">Dieser Tag hat nichts zum Übertragen.</p>
            )}

            <div className="flex flex-col gap-1.5">
              {entries?.map(e => {
                const key = `${e.kind}:${e.id}`
                const on = picked.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggle(e)}
                    aria-pressed={on}
                    className={`flex items-center gap-3 w-full min-h-11 px-3 py-2 rounded-inner border text-left transition-colors
                      ${on ? 'bg-accent-soft border-accent' : 'bg-surface-alt border-border-soft'}`}
                  >
                    <MealTypePill mealType={e.slot} label={MEAL_TYPE_LABELS[e.slot]} />
                    <span className="flex-1 min-w-0 truncate text-sm text-text">
                      {e.name}
                      {e.kind === 'portion' && <span className="text-text-muted"> · Box</span>}
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">{Math.round(e.kcal)} kcal</span>
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-xs text-text-muted">{t.hint}</p>
          <p className="text-xs text-text-faint">
            Boxen dürfen mit: der Prep-Zyklus plant Einkauf und Kochtag, die Zuordnung zum Tag
            gehört zur Tagesplanung. Einkaufs- und Kochliste ändern sich dadurch nicht.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-border-soft">
          <Button fullWidth onClick={run} disabled={sameDay || nothingPicked || busy}>
            {busy ? 'Läuft …' : `${t.action}${picked.size > 0 ? ` (${picked.size})` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
