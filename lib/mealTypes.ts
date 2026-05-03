/** The canonical 3 meal types used throughout the app */
export type MealTypeKey = 'fruehstueck' | 'hauptmahlzeit' | 'snack'

export const MEAL_TYPE_ORDER: MealTypeKey[] = ['fruehstueck', 'hauptmahlzeit', 'snack']

export const MEAL_TYPE_LABELS: Record<string, string> = {
  fruehstueck:   'Frühstück',
  hauptmahlzeit: 'Hauptmahlzeit',
  snack:         'Snack',
  // legacy values – displayed grouped under Hauptmahlzeit
  mittagessen:   'Hauptmahlzeit',
  abendessen:    'Hauptmahlzeit',
}

/** Visual config for each meal type section in the day view */
export const MEAL_TYPE_META: Record<MealTypeKey, { label: string; color: string; bg: string; border: string }> = {
  fruehstueck:   { label: 'Frühstück',       color: '#78716c', bg: '#fafaf9', border: '#e7e5e4' },
  hauptmahlzeit: { label: 'Hauptmahlzeit',   color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  snack:         { label: 'Snack',           color: '#71717a', bg: '#fafafa', border: '#e4e4e7' },
}

/** Pill-style colors for dashboards / calendar */
export const MEAL_TYPE_COLORS: Record<string, string> = {
  fruehstueck:   '#d97706',
  hauptmahlzeit: '#059669',
  snack:         '#7c3aed',
  mittagessen:   '#059669',
  abendessen:    '#4f46e5',
}

/** Normalise legacy meal_type values to the canonical 3 types */
export function normaliseMealType(type: string): MealTypeKey {
  if (type === 'mittagessen' || type === 'abendessen') return 'hauptmahlzeit'
  if (type === 'fruehstueck' || type === 'hauptmahlzeit' || type === 'snack') return type
  return 'hauptmahlzeit'
}
