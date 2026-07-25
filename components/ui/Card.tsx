import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  /**
   * Verschachtelte Blöcke innerhalb einer Karte: gedämpftere Fläche,
   * kleinerer Radius, kein eigener Schatten.
   */
  nested?: boolean
  /** Innenabstand weglassen, wenn der Inhalt selbst bis an den Rand geht. */
  flush?: boolean
  onClick?: () => void
}

export default function Card({ children, className = '', nested = false, flush = false, onClick }: CardProps) {
  const base = nested
    ? 'bg-surface-alt rounded-inner border border-border-soft'
    : 'bg-surface rounded-card border border-border shadow-card'
  const padding = flush ? '' : nested ? 'p-4' : 'p-5'

  if (onClick) {
    return (
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
        className={`${base} ${padding} cursor-pointer transition-transform active:scale-[0.99] ${className}`}
      >
        {children}
      </div>
    )
  }

  return <div className={`${base} ${padding} ${className}`}>{children}</div>
}

/** Überschrift innerhalb einer Karte — Caprasimo, sparsam einsetzen. */
export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-display font-normal text-lg text-text ${className}`}>{children}</h2>
}

/** Kleines Label in Versalien über einem Wert. */
export function CardLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[11px] uppercase tracking-[0.08em] font-semibold text-text-muted ${className}`}>
      {children}
    </span>
  )
}
