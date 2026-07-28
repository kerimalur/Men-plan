import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayEaten, type EatenMealLike, type EatenPortionLike } from '../lib/calculations.ts'

/** Eine Position mit runden Werten, damit die Erwartungen ablesbar bleiben. */
function item(eaten: boolean, kcal: number, protein: number, carbs: number, fat: number, cost: number) {
  return { eaten, kcal, protein, carbs, fat, cost }
}

function meal(items: ReturnType<typeof item>[], eaten = false): EatenMealLike {
  const sum = (k: 'kcal' | 'protein' | 'carbs' | 'fat' | 'cost') =>
    items.reduce((s, i) => s + i[k], 0)
  return {
    eaten,
    kcal_total:    sum('kcal'),
    protein_total: sum('protein'),
    carbs_total:   sum('carbs'),
    fat_total:     sum('fat'),
    cost_total:    sum('cost'),
    meal_items:    items,
  }
}

function portion(consumed: boolean, kcal: number, protein: number, carbs: number, fat: number, cost: number): EatenPortionLike {
  return {
    consumed,
    prep_batches: {
      kcal_per_portion:    kcal,
      protein_per_portion: protein,
      carbs_per_portion:   carbs,
      fat_per_portion:     fat,
      cost_per_portion:    cost,
    },
  }
}

test('nichts abgehakt ergibt ueberall 0', () => {
  const m = meal([item(false, 500, 30, 60, 10, 2.5), item(false, 200, 20, 5, 4, 1.25)])
  assert.deepEqual(dayEaten([m], []), { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 })
})

test('drei von acht Positionen abgehakt', () => {
  const items = [
    item(true,  300, 5,  70,  0.5, 1.2),   // Suesskartoffel
    item(true,  180, 35, 2,   3,   4.5),   // Oktopus
    item(true,  250, 24, 0,   17,  2.8),   // Hackfleisch
    item(false, 160, 4,  35,  0.2, 0.4),   // Kartoffel
    item(false, 120, 22, 5,   0.3, 1.1),   // Magerquark
    item(false,  60, 1,  12,  0.4, 2.2),   // Blaubeeren
    item(false, 130, 28, 0,   1,   2.6),   // Thunfisch
    item(false, 200, 10, 30,  5,   0.9),   // Beilage
  ]
  const eaten = dayEaten([meal(items)], [])
  assert.deepEqual(eaten, { kcal: 730, protein: 64, carbs: 72, fat: 20.5, cost: 8.5 })
})

test('erneutes Abwaehlen nimmt die Werte wieder heraus', () => {
  const items = [item(true, 300, 5, 70, 0.5, 1.2), item(true, 180, 35, 2, 3, 4.5)]
  const both = dayEaten([meal(items, true)], [])
  assert.equal(both.kcal, 480)

  items[1] = { ...items[1], eaten: false }
  const one = dayEaten([meal(items)], [])
  assert.deepEqual(one, { kcal: 300, protein: 5, carbs: 70, fat: 0.5, cost: 1.2 })
})

test('Mahlzeit mit Positionen zaehlt nie doppelt ueber ihr eigenes Haekchen', () => {
  const items = [item(true, 300, 5, 70, 0.5, 1.2), item(true, 180, 35, 2, 3, 4.5)]
  // eaten = true auf der Mahlzeit ist hier nur die Ableitung der Positionen.
  assert.equal(dayEaten([meal(items, true)], []).kcal, 480)
})

test('Mahlzeit ohne Positionen zaehlt ueber ihr eigenes Haekchen', () => {
  const leer: EatenMealLike = {
    eaten: true,
    kcal_total: 400, protein_total: 25, carbs_total: 40, fat_total: 12, cost_total: 3.5,
  }
  assert.deepEqual(dayEaten([leer], []), { kcal: 400, protein: 25, carbs: 40, fat: 12, cost: 3.5 })

  assert.equal(dayEaten([{ ...leer, eaten: false }], []).kcal, 0)
})

test('gegessene Boxen zaehlen mit, offene nicht', () => {
  const m = meal([item(true, 300, 5, 70, 0.5, 1.2)])
  const result = dayEaten([m], [
    portion(true,  650, 45, 60, 20, 3.4),
    portion(false, 700, 50, 65, 22, 3.9),
  ])
  assert.deepEqual(result, { kcal: 950, protein: 50, carbs: 130, fat: 20.5, cost: 4.6 })
})

test('Dezimalwerte aus PostgREST kommen teils als Strings', () => {
  const m = {
    eaten: false,
    kcal_total: 0, protein_total: 0, carbs_total: 0, fat_total: 0, cost_total: 0,
    meal_items: [
      { eaten: true, kcal: '300.5', protein: '5.25', carbs: '70', fat: '0.5', cost: '1.2345' },
    ],
  } as unknown as EatenMealLike
  assert.deepEqual(dayEaten([m], []), { kcal: 300.5, protein: 5.3, carbs: 70, fat: 0.5, cost: 1.235 })
})

test('fehlende Makros zaehlen als 0', () => {
  const m = {
    eaten: false,
    kcal_total: 0, protein_total: 0, carbs_total: 0, fat_total: 0, cost_total: 0,
    meal_items: [{ eaten: true, kcal: 120, protein: 8, carbs: null, fat: undefined, cost: 0.5 }],
  } as unknown as EatenMealLike
  assert.deepEqual(dayEaten([m], []), { kcal: 120, protein: 8, carbs: 0, fat: 0, cost: 0.5 })
})
