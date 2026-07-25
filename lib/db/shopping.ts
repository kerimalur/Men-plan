import { supabase, rows, ok } from './client'
import { roundForShopping, formatAmount } from '@/lib/units'
import type { CycleShoppingItem, ShoppingItem } from './types'

const COLUMNS = 'id, item, quantity, checked, is_generated, cycle_id, created_at'

// ── Freie Liste ─────────────────────────────────────────────────────────────

export async function listShopping(): Promise<ShoppingItem[]> {
  const res = await supabase.from('shopping_list').select(COLUMNS).order('checked').order('created_at')
  return rows<ShoppingItem>(res, 'Einkaufsliste laden')
}

export async function addShoppingItem(item: string, quantity?: string): Promise<void> {
  ok(
    await supabase.from('shopping_list').insert({ item, quantity: quantity?.trim() || null }),
    'Position hinzufügen'
  )
}

export async function setShoppingChecked(id: string, checked: boolean): Promise<void> {
  ok(await supabase.from('shopping_list').update({ checked }).eq('id', id), 'Position abhaken')
}

export async function deleteShoppingItem(id: string): Promise<void> {
  ok(await supabase.from('shopping_list').delete().eq('id', id), 'Position löschen')
}

export async function clearChecked(): Promise<void> {
  ok(await supabase.from('shopping_list').delete().eq('checked', true), 'Abgehakte löschen')
}

// ── Aggregation über den Zyklus ─────────────────────────────────────────────

/**
 * Zutaten aller Töpfe des Zyklus plus der freien Mahlzeiten im selben
 * Zeitraum, zusammengezählt pro Lebensmittel.
 *
 * Im Beispiel aus dem Umbau-Auftrag erscheinen Kartoffeln einmal mit 1500 g,
 * nicht zweimal mit 900 g und 600 g.
 */
export async function getCycleShoppingItems(cycleId: string): Promise<CycleShoppingItem[]> {
  const res = await supabase.rpc('cycle_shopping_items', { p_cycle_id: cycleId })
  return rows<CycleShoppingItem>(res, 'Einkaufsliste berechnen')
}

/**
 * Generierte Positionen des Zyklus ersetzen. Manuell hinzugefügte Positionen
 * bleiben unangetastet — sie tragen is_generated = false.
 *
 * `owned` enthält die Schlüssel der Positionen, die schon zuhause sind. Die
 * Rundung betrifft ausschliesslich die Einkaufsmenge; Nährwert- und
 * Kostenrechnung laufen weiter auf der exakt geplanten Menge.
 */
export async function syncCycleToShoppingList(
  cycleId: string,
  items: CycleShoppingItem[],
  owned: Set<string> = new Set()
): Promise<number> {
  ok(
    await supabase.from('shopping_list').delete().eq('cycle_id', cycleId).eq('is_generated', true),
    'Alte Positionen entfernen'
  )

  const toAdd = items.filter(i => !owned.has(shoppingKey(i)))
  if (toAdd.length === 0) return 0

  ok(
    await supabase.from('shopping_list').insert(
      toAdd.map(i => ({
        item: i.food_name,
        quantity: formatAmount(roundForShopping(i.total_amount, i.unit), i.unit),
        is_generated: true,
        cycle_id: cycleId,
      }))
    ),
    'Positionen übernehmen'
  )
  return toAdd.length
}

/** Stabiler Schlüssel für „habe ich schon zuhause". */
export function shoppingKey(item: CycleShoppingItem): string {
  return item.food_id ?? item.food_name.trim().toLowerCase()
}
