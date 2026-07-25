/** The canonical 4 meal types used throughout the app */
export type MealTypeKey = 'fruehstueck' | 'mittagessen' | 'abendessen' | 'snack'

export const MEAL_TYPE_ORDER: MealTypeKey[] = ['fruehstueck', 'mittagessen', 'abendessen', 'snack']

export const MEAL_TYPE_LABELS: Record<MealTypeKey, string> = {
  fruehstueck: 'Frühstück',
  mittagessen: 'Mittagessen',
  abendessen:  'Abendessen',
  snack:       'Snack',
}

/**
 * Farben je Mahlzeit-Typ als Design-Token, nicht als Hex-Wert.
 *
 * Die konkreten Werte stehen ausschliesslich im @theme-Block von
 * app/globals.css (--color-meal-*). Hier stehen nur die daraus erzeugten
 * Tailwind-Klassen bzw. var()-Referenzen.
 */
export const MEAL_TYPE_BG: Record<MealTypeKey, string> = {
  fruehstueck: 'bg-meal-fruehstueck',
  mittagessen: 'bg-meal-mittagessen',
  abendessen:  'bg-meal-abendessen',
  snack:       'bg-meal-snack',
}

export const MEAL_TYPE_TEXT: Record<MealTypeKey, string> = {
  fruehstueck: 'text-meal-fruehstueck',
  mittagessen: 'text-meal-mittagessen',
  abendessen:  'text-meal-abendessen',
  snack:       'text-meal-snack',
}

/** Für Stellen, die eine CSS-Farbe brauchen statt einer Klasse (z.B. SVG-fill). */
export const MEAL_TYPE_VAR: Record<MealTypeKey, string> = {
  fruehstueck: 'var(--color-meal-fruehstueck)',
  mittagessen: 'var(--color-meal-mittagessen)',
  abendessen:  'var(--color-meal-abendessen)',
  snack:       'var(--color-meal-snack)',
}

/** Type guard for values coming out of the database. */
export function isMealTypeKey(type: string): type is MealTypeKey {
  return type === 'fruehstueck' || type === 'mittagessen' || type === 'abendessen' || type === 'snack'
}

/**
 * Safe accessors for meal_type values read from the database.
 *
 * The CHECK constraints guarantee the four canonical values, but the client
 * types the columns as plain `string`. These keep the maps strictly typed
 * while still accepting DB input, and degrade gracefully instead of
 * rendering `undefined` should a stray value ever appear.
 */
export function mealTypeLabel(type: string): string {
  return isMealTypeKey(type) ? MEAL_TYPE_LABELS[type] : type
}

export function mealTypeBgClass(type: string): string {
  return isMealTypeKey(type) ? MEAL_TYPE_BG[type] : MEAL_TYPE_BG.snack
}
