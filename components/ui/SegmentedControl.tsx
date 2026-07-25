export interface Segment<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/**
 * Umschalter, z.B. Tagesplan / Wochenübersicht.
 * Container in surface-alt, aktives Segment in Akzentfarbe.
 */
export default function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={`inline-flex bg-surface-alt rounded-button p-[3px] gap-[3px] ${className}`}
    >
      {segments.map(seg => {
        const active = seg.value === value
        return (
          <button
            key={seg.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(seg.value)}
            className={[
              'flex-1 min-h-10 px-4 rounded-[11px] text-sm font-semibold whitespace-nowrap',
              'transition-all duration-200',
              active ? 'bg-accent text-accent-text' : 'bg-transparent text-text-secondary',
            ].join(' ')}
          >
            {seg.label}
          </button>
        )
      })}
    </div>
  )
}
