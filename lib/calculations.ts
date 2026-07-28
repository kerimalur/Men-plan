interface FoodLike {
  calories_per_100: number
  protein_per_100: number
  cost_per_100: number
  /**
   * Optional: macros were added in migration 0003 and are backfilled over
   * time. Existing rows default to 0, and some callers build synthetic food
   * objects that carry only kcal/protein/cost.
   */
  carbs_per_100?: number | null
  fat_per_100?: number | null
}

/**
 * Converts the entered amount+unit to a factor relative to 100 base units.
 * Solid foods (unit='g'): factor = amount / 100
 * Liquid foods (unit='ml'): factor depends on entered unit (ml, dl, l)
 */
export function toFactor(amount: number | string, unit: string): number {
  const n = typeof amount === 'string' ? parseFloat(amount) || 0 : amount
  switch (unit) {
    case 'g':   return n / 100
    case 'ml':  return n / 100
    case 'dl':  return (n * 100) / 100  // 1 dl = 100 ml
    case 'l':   return (n * 1000) / 100 // 1 l  = 1000 ml
    case 'stk': return n                // factor = number of pieces; *_per_100 stores value per piece
    default:    return n / 100
  }
}

export interface Nutrition {
  kcal: number
  protein: number
  carbs: number
  fat: number
  cost: number
}

/**
 * Calculates kcal, protein, carbs, fat and cost for a given food at a given
 * amount/unit. Foods without macro data contribute 0 for carbs and fat.
 */
export function calcNutrition(food: FoodLike, amount: number | string, unit: string): Nutrition {
  const factor = toFactor(amount, unit)
  return {
    kcal:    Math.round(food.calories_per_100 * factor * 10) / 10,
    protein: Math.round(food.protein_per_100  * factor * 10) / 10,
    carbs:   Math.round((food.carbs_per_100 ?? 0) * factor * 10) / 10,
    fat:     Math.round((food.fat_per_100   ?? 0) * factor * 10) / 10,
    cost:    Math.round(food.cost_per_100     * factor * 1000) / 1000,
  }
}

interface Summable {
  kcal: number
  protein: number
  cost: number
  carbs?: number | null
  fat?: number | null
}

export function sumItems(items: Summable[]): Nutrition {
  return items.reduce<Nutrition>(
    (acc, item) => ({
      kcal:    Math.round((acc.kcal    + item.kcal)         * 10)   / 10,
      protein: Math.round((acc.protein + item.protein)      * 10)   / 10,
      carbs:   Math.round((acc.carbs   + (item.carbs ?? 0)) * 10)   / 10,
      fat:     Math.round((acc.fat     + (item.fat   ?? 0)) * 10)   / 10,
      cost:    Math.round((acc.cost    + item.cost)         * 1000) / 1000,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 }
  )
}

// ── Bereits gegessen ────────────────────────────────────────────────────────

/**
 * Nur die Felder, die für die Gegessen-Summe gebraucht werden.
 *
 * Bewusst strukturell statt per Import aus lib/db/types: dieses Modul bleibt
 * damit frei von Datenbank-Abhängigkeiten und direkt unter node --test
 * ausführbar. MealItem, Meal und PortionWithBatch passen darauf.
 */
export interface EatenItemLike {
  eaten: boolean
  kcal: number
  protein: number
  carbs?: number | null
  fat?: number | null
  cost: number
}

export interface EatenMealLike {
  eaten: boolean
  kcal_total: number
  protein_total: number
  carbs_total: number
  fat_total: number
  cost_total: number
  meal_items?: EatenItemLike[]
}

export interface EatenPortionLike {
  consumed: boolean
  prep_batches: {
    kcal_per_portion: number
    protein_per_portion: number
    carbs_per_portion: number
    fat_per_portion: number
    cost_per_portion: number
  }
}

/**
 * Was an einem Tag tatsächlich schon gegessen ist.
 *
 * Zwei Quellen, dieselben wie bei der geplanten Tagessumme:
 *   Positionen freier Mahlzeiten mit eaten = true
 *   Boxen aus dem Prep-Zyklus mit consumed = true
 *
 * Mahlzeiten ohne Positionen zählen über ihr eigenes Häkchen — sonst fielen
 * Alt-Einträge, deren Positionen gelöscht wurden, stillschweigend heraus.
 * Mahlzeiten MIT Positionen zählen ausschliesslich über diese; das Häkchen der
 * Mahlzeit ist dort nur die Ableitung und würde sonst doppelt zählen.
 *
 * Gerundet wird einmal am Schluss, wie in den Triggern — nicht nach jeder
 * Addition wie in sumItems().
 */
export function dayEaten(meals: EatenMealLike[], portions: EatenPortionLike[]): Nutrition {
  let kcal = 0, protein = 0, carbs = 0, fat = 0, cost = 0

  for (const meal of meals) {
    const items = meal.meal_items ?? []

    if (items.length === 0) {
      if (!meal.eaten) continue
      kcal    += Number(meal.kcal_total)    || 0
      protein += Number(meal.protein_total) || 0
      carbs   += Number(meal.carbs_total)   || 0
      fat     += Number(meal.fat_total)     || 0
      cost    += Number(meal.cost_total)    || 0
      continue
    }

    for (const item of items) {
      if (!item.eaten) continue
      kcal    += Number(item.kcal)    || 0
      protein += Number(item.protein) || 0
      carbs   += Number(item.carbs)   || 0
      fat     += Number(item.fat)     || 0
      cost    += Number(item.cost)    || 0
    }
  }

  for (const p of portions) {
    if (!p.consumed) continue
    kcal    += Number(p.prep_batches.kcal_per_portion)    || 0
    protein += Number(p.prep_batches.protein_per_portion) || 0
    carbs   += Number(p.prep_batches.carbs_per_portion)   || 0
    fat     += Number(p.prep_batches.fat_per_portion)     || 0
    cost    += Number(p.prep_batches.cost_per_portion)    || 0
  }

  return {
    kcal:    Math.round(kcal    * 10)   / 10,
    protein: Math.round(protein * 10)   / 10,
    carbs:   Math.round(carbs   * 10)   / 10,
    fat:     Math.round(fat     * 10)   / 10,
    cost:    Math.round(cost    * 1000) / 1000,
  }
}
