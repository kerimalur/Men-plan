interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Beschriftung rechts der Box. Abgehakt wird sie durchgestrichen und gedämpft. */
  label?: string
  /** Zusatz rechtsbündig, z.B. die Menge. */
  trailing?: React.ReactNode
  className?: string
}

/**
 * Runde Checkbox, 20 px. Wird in Einkaufsliste und Kochliste verwendet.
 * Abgehakt: Fläche in --color-success, weisses Häkchen.
 * Die ganze Zeile ist Touch-Ziel und mindestens 44 px hoch.
 */
export default function Checkbox({ checked, onChange, label, trailing, className = '' }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-3 w-full min-h-11 text-left transition-colors ${className}`}
    >
      <span
        className={[
          'w-5 h-5 shrink-0 rounded-full inline-flex items-center justify-center',
          'transition-all duration-150',
          checked ? 'bg-success border-[1.5px] border-success' : 'bg-transparent border-[1.5px] border-border',
        ].join(' ')}
      >
        {checked && (
          <svg className="w-3 h-3 text-accent-text" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>

      {label && (
        <span className={`flex-1 text-sm ${checked ? 'line-through text-text-muted' : 'text-text'}`}>
          {label}
        </span>
      )}

      {trailing && (
        <span className={`text-sm shrink-0 ${checked ? 'text-text-faint' : 'text-text-muted'}`}>
          {trailing}
        </span>
      )}
    </button>
  )
}
