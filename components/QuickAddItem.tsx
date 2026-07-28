'use client'

import { useState, useEffect, useRef } from 'react'
import { searchFoods } from '@/lib/db/foods'
import { calcNutrition } from '@/lib/calculations'
import { unitsForFood } from '@/lib/units'
import type { Food } from '@/lib/db/types'

export interface QuickItem {
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  cost: number
}

/**
 * Eine einzelne Position an eine bestehende Mahlzeit hängen.
 *
 * Gedacht für den freien Tag: dort steht typischerweise EINE Mahlzeit
 * („Tagesaussicht") mit acht Positionen. Über MealModal ginge das nur, indem
 * die ganze Mahlzeit neu gespeichert wird — hier wird genau eine Zeile
 * eingefügt, ohne den Rest anzufassen.
 */
export default function QuickAddItem({ onAdd, onCancel }: {
  onAdd: (item: QuickItem) => Promise<void>
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [food, setFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length < 1 || food) { setResults([]); return }
      try { setResults(await searchFoods(query)) }
      catch { setResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [query, food])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function pick(f: Food) {
    setFood(f)
    setQuery(f.name)
    setResults([])
    setUnit(unitsForFood(f.unit)[0])
  }

  const amountNum = parseFloat(amount.replace(',', '.'))
  const valid = food !== null && Number.isFinite(amountNum) && amountNum > 0
  const preview = valid ? calcNutrition(food!, amountNum, unit) : null

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    const n = calcNutrition(food!, amountNum, unit)
    try {
      await onAdd({
        food_id:   food!.id,
        food_name: food!.name,
        amount:    amountNum,
        unit,
        kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat, cost: n.cost,
      })
      setFood(null); setQuery(''); setAmount(''); setResults([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Position konnte nicht gespeichert werden')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={boxRef} className="mt-2 rounded-inner border border-border-soft bg-surface p-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setFood(null) }}
          placeholder="Lebensmittel suchen…"
          autoFocus
          className="w-full min-h-11 px-3 rounded-button bg-surface border border-border text-text text-sm outline-none focus:border-accent"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 top-full left-0 right-0 mt-1 max-h-44 overflow-y-auto rounded-inner border border-border bg-surface shadow-card">
            {results.map(f => (
              <li key={f.id}>
                <button
                  type="button"
                  onMouseDown={() => pick(f)}
                  className="w-full text-left px-3 py-2 min-h-11 hover:bg-border-soft"
                >
                  <span className="text-sm text-text">{f.name}</span>
                  <span className="block text-[11px] text-text-muted">
                    {f.calories_per_100} kcal · {f.protein_per_100} g P
                    {f.unit === 'stk' ? ' pro Stück' : ` / 100 ${f.unit}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 mt-2">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
          placeholder="Menge"
          className="flex-1 min-w-0 min-h-11 px-3 rounded-button bg-surface border border-border text-text text-sm outline-none focus:border-accent"
        />
        <select
          value={unit}
          onChange={e => setUnit(e.target.value)}
          className="min-h-11 px-2 rounded-button bg-surface border border-border text-text text-sm outline-none"
        >
          {unitsForFood(food?.unit ?? 'g').map(u => (
            <option key={u} value={u}>{u === 'stk' ? 'Stk.' : u}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!valid || saving}
          className="min-h-11 px-4 rounded-button bg-accent text-accent-text text-sm font-semibold disabled:opacity-40"
        >
          {saving ? '…' : 'Hinzufügen'}
        </button>
      </div>

      {preview && (
        <p className="mt-2 text-[11px] text-text-muted">
          {preview.kcal} kcal · {preview.protein} g Protein · CHF {preview.cost.toFixed(2)}
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

      <button
        type="button"
        onClick={onCancel}
        className="tap-inline mt-2 text-xs text-text-muted"
      >
        Fertig
      </button>
    </div>
  )
}
