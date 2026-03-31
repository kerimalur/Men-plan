'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ShoppingItem { id: string; item: string; quantity: string | null; checked: boolean }

interface SyncItem {
  food_name: string
  total: number
  unit: string  // 'g' or 'ml'
  food_id: string | null
}

function toBaseAmount(amount: number, unit: string): number {
  switch (unit) {
    case 'g':  return amount
    case 'ml': return amount
    case 'dl': return amount * 100
    case 'l':  return amount * 1000
    default:   return amount
  }
}

function getMondayOfWeek(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d); m.setDate(d.getDate() + diff); return m
}

function toDateStr(d: Date) { return d.toISOString().split('T')[0] }

function formatAmount(amount: number, baseUnit: string): string {
  if (baseUnit === 'ml') {
    if (amount >= 1000) return `${(amount / 1000).toFixed(2).replace(/\.?0+$/, '')} l`
    if (amount >= 100)  return `${(amount / 100).toFixed(1).replace(/\.?0+$/, '')} dl`
    return `${Math.round(amount)} ml`
  }
  if (amount >= 1000) return `${(amount / 1000).toFixed(2).replace(/\.?0+$/, '')} kg`
  return `${Math.round(amount)} g`
}

export default function EinkaufslistePage() {
  const [items, setItems]         = useState<ShoppingItem[]>([])
  const [newItem, setNewItem]     = useState('')
  const [newQty, setNewQty]       = useState('')
  const [syncing, setSyncing]     = useState(false)
  const [syncItems, setSyncItems] = useState<SyncItem[]>([])
  const [showSync, setShowSync]   = useState(false)
  const [weekStart, setWeekStart] = useState(() => toDateStr(getMondayOfWeek(new Date())))

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('shopping_list').select('*').order('checked').order('created_at')
    setItems(data || [])
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    await supabase.from('shopping_list').insert({ item: newItem.trim(), quantity: newQty.trim() || null })
    setNewItem(''); setNewQty(''); await load()
  }

  async function toggle(id: string, checked: boolean) {
    await supabase.from('shopping_list').update({ checked: !checked }).eq('id', id); await load()
  }

  async function remove(id: string) {
    await supabase.from('shopping_list').delete().eq('id', id); await load()
  }

  async function clearChecked() {
    await supabase.from('shopping_list').delete().eq('checked', true); await load()
  }

  // ── Sync from meal plan ──────────────────────────────────────
  async function syncFromPlan() {
    setSyncing(true)
    const start = weekStart
    const endDate = new Date(weekStart + 'T12:00:00'); endDate.setDate(endDate.getDate() + 6)
    const end = toDateStr(endDate)

    // 1. Get all meal_plans for the week
    const { data: plans } = await supabase.from('meal_plans').select('id').gte('date', start).lte('date', end)
    if (!plans?.length) { setSyncItems([]); setSyncing(false); return }

    const planIds = plans.map(p => p.id)

    // 2. Get all meals
    const { data: meals } = await supabase.from('meals').select('id').in('plan_id', planIds)
    if (!meals?.length) { setSyncItems([]); setSyncing(false); return }

    const mealIds = meals.map(m => m.id)

    // 3. Get all meal_items with food unit info
    const { data: mealItems } = await supabase
      .from('meal_items')
      .select('food_id, food_name, amount, unit, foods(unit)')
      .in('meal_id', mealIds)

    if (!mealItems?.length) { setSyncItems([]); setSyncing(false); return }

    // 4. Group by food_id (or food_name if deleted)
    const grouped: Record<string, SyncItem> = {}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mealItems.forEach((item: any) => {
      const key      = item.food_id || item.food_name
      const foodsUnit = Array.isArray(item.foods) ? item.foods[0]?.unit : item.foods?.unit
      const baseUnit = foodsUnit || (item.unit === 'g' ? 'g' : 'ml')
      const baseAmt  = toBaseAmount(item.amount, item.unit)

      if (!grouped[key]) {
        grouped[key] = { food_name: item.food_name, total: 0, unit: baseUnit, food_id: item.food_id }
      }
      grouped[key].total += baseAmt
    })

    setSyncItems(Object.values(grouped).sort((a, b) => a.food_name.localeCompare(b.food_name)))
    setSyncing(false)
  }

  async function addSyncItemToList(item: SyncItem) {
    await supabase.from('shopping_list').insert({
      item:     item.food_name,
      quantity: formatAmount(item.total, item.unit),
    })
    await load()
  }

  async function addAllToList() {
    if (!syncItems.length) return
    await supabase.from('shopping_list').insert(
      syncItems.map(item => ({ item: item.food_name, quantity: formatAmount(item.total, item.unit) }))
    )
    await load()
    setShowSync(false)
  }

  const unchecked = items.filter(i => !i.checked)
  const checked   = items.filter(i => i.checked)

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Einkaufsliste</h1>
        <div className="flex items-center gap-2">
          {checked.length > 0 && (
            <button onClick={clearChecked} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Erledigte löschen
            </button>
          )}
          <button
            onClick={() => setShowSync(v => !v)}
            className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Woche synchronisieren
          </button>
        </div>
      </div>

      {/* Sync panel */}
      {showSync && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Woche synchronisieren</h2>
          <p className="text-xs text-gray-400 mb-4">
            Berechnet alle benötigten Zutaten aus dem Wochenplan und summiert sie auf.
          </p>
          <div className="flex items-center gap-2 mb-4">
            <label className="text-xs text-gray-600 shrink-0">Wochenbeginn (Montag):</label>
            <input
              type="date"
              value={weekStart}
              onChange={e => setWeekStart(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={syncFromPlan}
              disabled={syncing}
              className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {syncing ? 'Lädt…' : 'Berechnen'}
            </button>
          </div>

          {syncItems.length > 0 && (
            <>
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl mb-3 overflow-hidden">
                {syncItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-gray-800">{item.food_name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-600">{formatAmount(item.total, item.unit)}</span>
                      <button
                        onClick={() => addSyncItemToList(item)}
                        className="text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                      >
                        + Liste
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={addAllToList}
                className="w-full bg-emerald-600 text-white py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                Alle zur Einkaufsliste hinzufügen
              </button>
            </>
          )}

          {!syncing && syncItems.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">
              Für diese Woche sind keine Mahlzeiten geplant.
            </p>
          )}
        </div>
      )}

      {/* Add form */}
      <form onSubmit={add} className="flex gap-2 mb-5">
        <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)}
          placeholder="Artikel…"
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
        <input type="text" value={newQty} onChange={e => setNewQty(e.target.value)}
          placeholder="Menge"
          className="w-24 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
        <button type="submit"
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
          +
        </button>
      </form>

      {/* List */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-50">
        {items.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-gray-400">Einkaufsliste ist leer</p>
        )}
        {[...unchecked, ...checked].map(item => (
          <div key={item.id} className="flex items-center gap-3 px-5 py-3">
            <input type="checkbox" checked={item.checked} onChange={() => toggle(item.id, item.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0" />
            <span className={`flex-1 text-sm ${item.checked ? 'line-through text-gray-300' : 'text-gray-900'}`}>
              {item.item}
            </span>
            {item.quantity && (
              <span className={`text-xs font-medium shrink-0 ${item.checked ? 'text-gray-300' : 'text-gray-500'}`}>
                {item.quantity}
              </span>
            )}
            <button onClick={() => remove(item.id)} className="text-gray-300 hover:text-red-400 transition-colors text-base leading-none shrink-0">×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
