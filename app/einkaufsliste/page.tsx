'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ShoppingItem {
  id: string
  item: string
  quantity: string | null
  checked: boolean
}

export default function EinkaufslistePage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [newItem, setNewItem] = useState('')
  const [newQty, setNewQty] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('shopping_list')
      .select('*')
      .order('checked')
      .order('created_at')
    setItems(data || [])
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    await supabase.from('shopping_list').insert({
      item:     newItem.trim(),
      quantity: newQty.trim() || null,
    })
    setNewItem('')
    setNewQty('')
    await load()
  }

  async function toggle(id: string, checked: boolean) {
    await supabase.from('shopping_list').update({ checked: !checked }).eq('id', id)
    await load()
  }

  async function remove(id: string) {
    await supabase.from('shopping_list').delete().eq('id', id)
    await load()
  }

  async function clearChecked() {
    await supabase.from('shopping_list').delete().eq('checked', true)
    await load()
  }

  const unchecked = items.filter(i => !i.checked)
  const checked   = items.filter(i => i.checked)

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Einkaufsliste</h1>
        {checked.length > 0 && (
          <button onClick={clearChecked}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Erledigte löschen
          </button>
        )}
      </div>

      {/* Add form */}
      <form onSubmit={add} className="flex gap-2 mb-6">
        <input
          type="text"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          placeholder="Artikel…"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
        <input
          type="text"
          value={newQty}
          onChange={e => setNewQty(e.target.value)}
          placeholder="Menge"
          className="w-24 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
        <button type="submit"
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          +
        </button>
      </form>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {items.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-gray-400">Einkaufsliste ist leer</p>
        )}
        {[...unchecked, ...checked].map(item => (
          <div key={item.id} className="flex items-center gap-3 px-5 py-3">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => toggle(item.id, item.checked)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
            />
            <span className={`flex-1 text-sm ${item.checked ? 'line-through text-gray-300' : 'text-gray-900'}`}>
              {item.item}
            </span>
            {item.quantity && (
              <span className="text-xs text-gray-400 shrink-0">{item.quantity}</span>
            )}
            <button onClick={() => remove(item.id)}
              className="text-gray-300 hover:text-red-400 transition-colors text-base leading-none shrink-0">
              ×
            </button>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        Automatische Generierung aus dem Wochenplan folgt in einem nächsten Schritt.
      </p>
    </div>
  )
}
