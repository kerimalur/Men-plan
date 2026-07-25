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
