'use client'

import { useState } from 'react'
import { copyDayMeals } from '@/lib/db/plans'
import { toDateStr, DAY_LONG } from '@/lib/dates'
import { useToast } from '@/components/Toast'
import Button from '@/components/ui/Button'

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
    hint:   'Der Quelltag ist danach leer. Ein bereits geplanter Zieltag wird ergänzt, nicht ersetzt.',
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
  const [busy, setBusy] = useState(false)

  const sameDay = target === date

  async function run() {
    if (sameDay || busy) return
    setBusy(true)
    try {
      const count = await copyDayMeals(date, target, mode)
      toast(
        count === 0
          ? 'Der Tag hat keine Mahlzeiten zum Übertragen.'
          : `${count} ${count === 1 ? 'Mahlzeit' : 'Mahlzeiten'} ${mode === 'move' ? 'verschoben' : 'kopiert'}.`,
        count === 0 ? 'info' : 'success',
      )
      onDone(target)
    }
    catch (e) {
      toast(e instanceof Error ? e.message : 'Übertragen fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-text/30 backdrop-blur-sm">
      <div className="w-full sm:max-w-md flex flex-col bg-surface rounded-t-card sm:rounded-card border border-border shadow-float">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border-soft">
          <h2 className="font-display font-normal text-lg text-text">{t.title}</h2>
          <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Alle Mahlzeiten vom <span className="font-semibold text-text">{longDate(date)}</span> {t.verb}
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

          <p className="text-xs text-text-muted">{t.hint}</p>
          <p className="text-xs text-text-faint">
            Vorgekochte Boxen aus Prep-Zyklen bleiben, wo sie sind — übertragen werden nur frei geplante Mahlzeiten.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-border-soft">
          <Button fullWidth onClick={run} disabled={sameDay || busy}>
            {busy ? 'Läuft …' : t.action}
          </Button>
        </div>
      </div>
    </div>
  )
}
