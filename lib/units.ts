/**
 * Zentrale Mengen- und Einheitenlogik.
 *
 * Zuvor lag das als lokale Helper in app/einkaufsliste/page.tsx. Ab hier gilt:
 * jede Formatierung und jede Umrechnung von Mengen läuft über dieses Modul,
 * damit Kochliste, Einkaufsliste, Rezepte und Tagesansicht dieselben Zahlen
 * zeigen.
 *
 * Zwei Begriffe sauber getrennt:
 *   Eingabe-Einheit  — was der Nutzer tippt: g, ml, dl, l, stk
 *   Basis-Einheit    — worin gerechnet und aggregiert wird: g, ml, stk
 */

/** Einheiten, die der Nutzer eingeben darf. */
export type InputUnit = 'g' | 'ml' | 'dl' | 'l' | 'stk'

/** Einheiten, in denen intern gerechnet und aggregiert wird. */
export type BaseUnit = 'g' | 'ml' | 'stk'

export const INPUT_UNITS: InputUnit[] = ['g', 'ml', 'dl', 'l', 'stk']

/**
 * Rechnet eine Menge in ihre Basis-Einheit um.
 *
 * Nötig, damit sich Positionen über verschiedene Eingabe-Einheiten hinweg
 * addieren lassen: 6 dl und 400 ml sind zusammen 1 l, nicht "6 + 400".
 *
 *   toBaseUnit(6, 'dl')   → { amount: 600,  unit: 'ml' }
 *   toBaseUnit(1.5, 'l')  → { amount: 1500, unit: 'ml' }
 *   toBaseUnit(900, 'g')  → { amount: 900,  unit: 'g'  }
 */
export function toBaseUnit(amount: number, unit: string): { amount: number; unit: BaseUnit } {
  switch (unit) {
    case 'dl':  return { amount: amount * 100,  unit: 'ml' }
    case 'l':   return { amount: amount * 1000, unit: 'ml' }
    case 'ml':  return { amount, unit: 'ml' }
    case 'stk': return { amount, unit: 'stk' }
    case 'g':   return { amount, unit: 'g' }
    default:    return { amount, unit: 'g' }
  }
}

/**
 * Nur die Zahl in Basis-Einheit, ohne die Einheit selbst.
 * Entspricht dem alten toBaseAmount() aus der Einkaufsliste.
 */
export function toBaseAmount(amount: number, unit: string): number {
  return toBaseUnit(amount, unit).amount
}

/** Hängt überflüssige Nullen ab: "1.50" → "1.5", "2.00" → "2". */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/**
 * Formatiert eine Menge in der jeweils sinnvollsten Einheit.
 *
 *   formatAmount(900, 'g')    → '900 g'
 *   formatAmount(1500, 'g')   → '1.5 kg'
 *   formatAmount(600, 'ml')   → '6 dl'
 *   formatAmount(1500, 'ml')  → '1.5 l'
 *   formatAmount(3, 'stk')    → '3 Stk.'
 *
 * Erwartet eine Menge in Basis-Einheit. Eingabe-Einheiten vorher durch
 * toBaseUnit() schicken.
 */
export function formatAmount(amount: number, baseUnit: string): string {
  if (baseUnit === 'stk') {
    return `${amount % 1 === 0 ? amount : amount.toFixed(1)} Stk.`
  }
  if (baseUnit === 'ml') {
    if (amount >= 1000) return `${trimZeros((amount / 1000).toFixed(2))} l`
    if (amount >= 100)  return `${trimZeros((amount / 100).toFixed(1))} dl`
    return `${Math.round(amount)} ml`
  }
  if (amount >= 1000) return `${trimZeros((amount / 1000).toFixed(2))} kg`
  return `${Math.round(amount)} g`
}

/**
 * Rundet auf eine Menge, die sich im Laden tatsächlich kaufen lässt.
 *
 *   roundForShopping(1450, 'g')  → 1500
 *   roundForShopping(2.3, 'stk') → 3
 *
 * Wird ausschliesslich für die Einkaufsliste verwendet. Nährwert- und
 * Kostenberechnung laufen weiter auf der exakt geplanten Menge — sonst würde
 * Aufrunden die Tagesbilanz verfälschen.
 */
export function roundForShopping(amount: number, baseUnit: string): number {
  if (amount <= 0) return 0
  if (baseUnit === 'stk') return Math.ceil(amount)
  // g und ml: auf volle 100 aufrunden, aber nie auf 0
  return Math.max(100, Math.ceil(amount / 100) * 100)
}

/**
 * Einheiten, die zu einem Lebensmittel angeboten werden.
 * Flüssiges bekommt ml/dl/l, Stückware stk, alles andere g.
 */
export function unitsForFood(foodUnit: string): InputUnit[] {
  if (foodUnit === 'ml')  return ['ml', 'dl', 'l']
  if (foodUnit === 'stk') return ['stk']
  return ['g']
}
