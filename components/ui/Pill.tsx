import type { ReactNode } from 'react'
import type { MealTypeKey } from '@/lib/mealTypes'

export type PillVariant = 'accent' | 'sage' | 'neutral' | 'success' | 'warning' | 'danger'

const VARIANTS: Record<PillVariant, string> = {
  accent:  'bg-accent-soft text-accent',
  sage:    'bg-sage-soft text-sage',
  neutral: 'bg-surface-alt text-text-secondary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger:  'bg-danger-soft text-danger',
}

/** Mahlzeit-Typ → Pill-Variante. Farben kommen aus den Tokens. */
const MEAL_TYPE_VARIANT: Record<MealTypeKey, PillVariant> = {
  fruehstueck: 'warning',
  mittagessen: 'sage',
  abendessen:  'accent',
  snack:       'neutral',
}

interface PillProps {
  children: ReactNode
  variant?: PillVariant
  className?: string
  onClick?: () => void
}

export default function Pill({ children, variant = 'neutral', className = '', onClick }: PillProps) {
  const classes = `inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${VARIANTS[variant]} ${className}`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${classes} tap-inline transition-transform active:scale-[0.97]`}>
        {children}
      </button>
    )
  }
  return <span className={classes}>{children}</span>
}

/** Pill für einen Mahlzeit-Typ, mit passender Tokenfarbe. */
export function MealTypePill({ mealType, label, className = '' }: {
  mealType: MealTypeKey
  label: string
  className?: string
}) {
  return <Pill variant={MEAL_TYPE_VARIANT[mealType]} className={className}>{label}</Pill>
}
