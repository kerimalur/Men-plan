'use client'

import { useState, useRef, useEffect } from 'react'

interface AmountInputProps {
  value: number
  unit: string
  /** Feuert bei Bestätigung (Enter) oder Fokusverlust. */
  onCommit: (value: number) => void
  /** Feuert bei jedem Tastendruck — für die Live-Vorschau der Nährwerte. */
  onPreview?: (value: number) => void
  onCancel?: () => void
  /** Ganzzahlig erzwingen. Bei unit='stk' ohnehin automatisch. */
  integer?: boolean
  autoFocus?: boolean
}

/**
 * Inline-Bearbeitung einer Menge.
 *
 * Ersetzt das bisherige "löschen und neu hinzufügen" an allen drei Stellen:
 * Zutat in einer geplanten Mahlzeit, Zutat in einem Rezept (pro Portion),
 * Portionenzahl eines Batches.
 */
export default function AmountInput({
  value,
  unit,
  onCommit,
  onPreview,
  onCancel,
  integer = false,
  autoFocus = true,
}: AmountInputProps) {
  const isInt = integer || unit === 'stk'
  const [text, setText] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)
  const committed = useRef(false)

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [autoFocus])

  const steps = isInt ? [-1, 1] : [-25, -10, 10, 25]

  function parse(s: string): number {
    const n = parseFloat(s.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return 0
    return isInt ? Math.round(n) : n
  }

  function update(s: string) {
    setText(s)
    onPreview?.(parse(s))
  }

  function step(delta: number) {
    const next = Math.max(0, parse(text) + delta)
    update(String(next))
    inputRef.current?.focus()
  }

  function commit() {
    if (committed.current) return
    committed.current = true
    onCommit(parse(text))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={e => update(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { committed.current = true; onCancel?.() }
          }}
          className="min-h-11 w-24 px-3 rounded-button bg-surface border border-accent text-text text-sm font-semibold text-right outline-none"
        />
        <span className="text-sm text-text-muted">{unit}</span>
      </div>

      <div className="flex gap-1.5">
        {steps.map(d => (
          <button
            key={d}
            type="button"
            // onMouseDown statt onClick: sonst feuert der Blur des Feldes zuerst
            // und committet, bevor der Schritt angewandt ist.
            onMouseDown={e => { e.preventDefault(); step(d) }}
            className="min-h-11 flex-1 rounded-button bg-surface-alt border border-border text-text-secondary text-xs font-semibold transition-transform active:scale-[0.97]"
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
    </div>
  )
}
