/**
 * Statistik-Karte mit horizontalem Fortschrittsbalken.
 *
 * Ersetzt den früheren Kreisbogen (ArcProgress in app/page.tsx).
 * Aufbau von oben nach unten:
 *   Label in Versalien · grosser Wert in Caprasimo + Einheit · Zielwert · Balken
 */

export type StatKind = 'goal' | 'limit'

interface StatCardProps {
  label: string
  value: number
  max: number
  unit?: string
  /**
   * 'goal'  — Erreichen ist gut (Protein): rot → gelb → grün
   * 'limit' — Überschreiten ist schlecht (Kalorien, Kosten): grün → rot
   */
  kind: StatKind
  /** Nachkommastellen der Anzeige. Kosten brauchen 2, kcal und Protein 0. */
  decimals?: number
}

function barColor(value: number, max: number, kind: StatKind): string {
  if (max <= 0) return 'bg-text-muted'
  const pct = value / max
  if (kind === 'limit') return pct > 1 ? 'bg-danger' : 'bg-success'
  if (pct >= 1)   return 'bg-success'
  if (pct >= 0.8) return 'bg-warning'
  return 'bg-danger'
}

export default function StatCard({ label, value, max, unit = '', kind, decimals = 0 }: StatCardProps) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0

  return (
    <div className="bg-surface rounded-card border border-border shadow-card p-4 flex flex-col justify-between">
      <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-text-muted">
        {label}
      </span>

      <div className="mt-2 mb-1 flex items-baseline gap-1">
        <span className="font-display font-normal text-2xl leading-none text-text">
          {value.toFixed(decimals)}
        </span>
        {unit && <span className="text-xs text-text-muted">{unit}</span>}
      </div>

      <span className="text-[11px] text-text-faint mb-2">
        / {max.toFixed(decimals)}{unit}
      </span>

      <div className="h-1.5 w-full rounded-pill bg-border overflow-hidden">
        <div
          className={`h-full rounded-pill transition-[width] duration-300 ${barColor(value, max, kind)}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  )
}

/** Drei Statistik-Karten nebeneinander, gleiche Höhe. */
export function StatCardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-3 items-stretch">{children}</div>
}
