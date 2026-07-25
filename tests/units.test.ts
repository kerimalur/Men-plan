import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatAmount,
  roundForShopping,
  toBaseUnit,
  toBaseAmount,
  unitsForFood,
} from '../lib/units.ts'

test('formatAmount waehlt die sinnvollste Einheit', () => {
  assert.equal(formatAmount(900, 'g'), '900 g')
  assert.equal(formatAmount(999, 'g'), '999 g')
  assert.equal(formatAmount(1000, 'g'), '1 kg')
  assert.equal(formatAmount(1500, 'g'), '1.5 kg')
  assert.equal(formatAmount(2000, 'g'), '2 kg')
  assert.equal(formatAmount(100000, 'g'), '100 kg')
})

test('formatAmount fuer Fluessigkeiten', () => {
  assert.equal(formatAmount(50, 'ml'), '50 ml')
  assert.equal(formatAmount(99, 'ml'), '99 ml')
  assert.equal(formatAmount(600, 'ml'), '6 dl')
  assert.equal(formatAmount(1500, 'ml'), '1.5 l')
})

test('formatAmount fuer Stueckware', () => {
  assert.equal(formatAmount(3, 'stk'), '3 Stk.')
  assert.equal(formatAmount(2.5, 'stk'), '2.5 Stk.')
})

test('toBaseUnit normalisiert Eingabe-Einheiten', () => {
  assert.deepEqual(toBaseUnit(6, 'dl'), { amount: 600, unit: 'ml' })
  assert.deepEqual(toBaseUnit(1.5, 'l'), { amount: 1500, unit: 'ml' })
  assert.deepEqual(toBaseUnit(900, 'g'), { amount: 900, unit: 'g' })
  assert.deepEqual(toBaseUnit(3, 'stk'), { amount: 3, unit: 'stk' })
})

test('toBaseAmount erlaubt Aggregation ueber Einheiten hinweg', () => {
  // 6 dl + 400 ml = 1 l
  const total = toBaseAmount(6, 'dl') + toBaseAmount(400, 'ml')
  assert.equal(total, 1000)
  assert.equal(formatAmount(total, 'ml'), '1 l')
})

test('roundForShopping rundet auf kaufbare Mengen auf', () => {
  assert.equal(roundForShopping(1450, 'g'), 1500)
  assert.equal(roundForShopping(1500, 'g'), 1500)
  assert.equal(roundForShopping(1501, 'g'), 1600)
  assert.equal(roundForShopping(2.3, 'stk'), 3)
  assert.equal(roundForShopping(3, 'stk'), 3)
  assert.equal(roundForShopping(0, 'g'), 0)
  // sehr kleine Mengen fallen nicht auf 0 zurueck
  assert.equal(roundForShopping(20, 'g'), 100)
})

test('unitsForFood bietet passende Einheiten an', () => {
  assert.deepEqual(unitsForFood('ml'), ['ml', 'dl', 'l'])
  assert.deepEqual(unitsForFood('stk'), ['stk'])
  assert.deepEqual(unitsForFood('g'), ['g'])
})

/**
 * Akzeptanzkriterium 1 aus dem Umbau-Auftrag, Rechenkern:
 * Rezept A 300 g/Portion und Rezept B 200 g/Portion, je 3 Portionen
 * → 900 g in Topf A, 600 g in Topf B, 1500 g auf der Einkaufsliste.
 */
test('Akzeptanzkriterium 1: Hochrechnung und Aggregation', () => {
  const topfA = 300 * 3
  const topfB = 200 * 3
  assert.equal(topfA, 900)
  assert.equal(topfB, 600)
  assert.equal(formatAmount(topfA, 'g'), '900 g')
  assert.equal(formatAmount(topfB, 'g'), '600 g')

  const einkauf = toBaseAmount(topfA, 'g') + toBaseAmount(topfB, 'g')
  assert.equal(einkauf, 1500)
  assert.equal(formatAmount(einkauf, 'g'), '1.5 kg')
  assert.equal(roundForShopping(einkauf, 'g'), 1500)
})
