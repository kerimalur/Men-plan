import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:   'bg-accent text-accent-text hover:bg-accent-hover',
  secondary: 'bg-surface-alt text-text-secondary border border-border hover:bg-border-soft',
  ghost:     'bg-transparent text-accent hover:bg-accent-soft',
  danger:    'bg-danger-soft text-danger hover:bg-danger hover:text-accent-text',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
  fullWidth?: boolean
}

/** Mindesthöhe 44 px — Touch-Ziel (Akzeptanzkriterium 17). */
export default function Button({
  children,
  variant = 'primary',
  fullWidth = false,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'min-h-11 px-4 rounded-button text-sm font-semibold',
        'inline-flex items-center justify-center gap-2',
        'transition-all duration-150 active:scale-[0.97]',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  /** Pflicht: der Button trägt nur ein Icon, braucht also einen Namen. */
  label: string
  variant?: ButtonVariant
}

/** Quadratischer Icon-Button, 44 × 44 px. */
export function IconButton({ children, label, variant = 'secondary', className = '', type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={[
        'w-11 h-11 shrink-0 rounded-button',
        'inline-flex items-center justify-center',
        'transition-all duration-150 active:scale-[0.97]',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
