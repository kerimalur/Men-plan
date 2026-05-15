/** The canonical 4 meal types used throughout the app */
export type MealTypeKey = 'fruehstueck' | 'mittagessen' | 'abendessen' | 'snack'

export const MEAL_TYPE_ORDER: MealTypeKey[] = ['fruehstueck', 'mittagessen', 'abendessen', 'snack']

export const MEAL_TYPE_LABELS: Record<string, string> = {
  fruehstueck:   'Frühstück',
  mittagessen:   'Mittagessen',
  abendessen:    'Abendessen',
  snack:         'Snack',
  // legacy value – displayed as Mittagessen
  hauptmahlzeit: 'Mittagessen',
}

/** Visual config for each meal type section in the day view */
export const MEAL_TYPE_META: Record<MealTypeKey, { label: string; color: string; bg: string; border: string }> = {
  fruehstueck: { label: 'Frühstück',   color: '#78716c', bg: '#fafaf9', border: '#e7e5e4' },
  mittagessen: { label: 'Mittagessen', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
  abendessen:  { label: 'Abendessen',  color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' },
  snack:       { label: 'Snack',       color: '#71717a', bg: '#fafafa', border: '#e4e4e7' },
}

/** Pill-style colors for dashboards / calendar */
export const MEAL_TYPE_COLORS: Record<string, string> = {
  fruehstueck:   '#d97706',
  mittagessen:   '#059669',
  abendessen:    '#4f46e5',
  snack:         '#7c3aed',
  hauptmahlzeit: '#059669',
}

/** Normalise legacy meal_type values to the canonical 4 types */
export function normaliseMealType(type: string): MealTypeKey {
  if (type === 'hauptmahlzeit') return 'mittagessen'
  if (type === 'fruehstueck' || type === 'mittagessen' || type === 'abendessen' || type === 'snack') return type as MealTypeKey
  return 'mittagessen'
}
