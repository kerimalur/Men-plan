'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getRecipe, addRecipeItem, updateRecipeItemAmount, deleteRecipeItem, nutritionPerPortion,
} from '@/lib/db/recipes'
import { searchFoods, getFoodsByIds } from '@/lib/db/foods'
import type { Food, RecipeItem, ItemUnit } from '@/lib/db/types'
import type { Nutrition } from '@/lib/calculations'
import { formatAmount, toBaseUnit, unitsForFood } from '@/lib/units'
import { useToast } from '@/components/Toast'
import { CardLabel } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import AmountInput from '@/components/ui/AmountInput'

interface Props {
  recipeId: string
  /**
   * Startwerte, falls der Aufrufer das Rezept schon geladen hat. Fehlen sie,
   * lädt die Komponente selbst nach — so lässt sie sich auch aus dem
   * Prep-Planer heraus öffnen, wo nur die recipe_id bekannt ist.
   */
  initialItems?: RecipeItem[]
  initialFoods?: Map<string, Food>
  /** Läuft nach jeder gespeicherten Änderung an den Zutaten. */
  onChanged?: () => void | Promise<void>
  /** Nährwerte pro Portion, inklusive Live-Vorschau während des Tippens. */
  onNutrition?: (n: Nutrition) => void
}

/**
 * Zutatenliste eines Rezepts, pro Portion, mit Bearbeiten/Entfernen/Hinzufügen.
 *
 * Eine Implementierung für alle Stellen: Rezept-Detail, Prep-Zyklus und
 * Zyklus-Planer. Mengen sind immer PRO PORTION — die Hochrechnung auf Töpfe
 * und Boxen passiert an anderer Stelle.
 */
export default function RecipeIngredients({
  recipeId, initialItems, initialFoods, onChanged, onNutrition,
}: Props) {
  const { toast } = useToast()

  const [items, setItems] = useState<RecipeItem[]>(initialItems ?? [])
  const [foods, setFoods] = useState<Map<string, Food>>(initialFoods ?? new Map())
  const [loading, setLoading] = useState(initialItems === undefined)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [previewAmounts, setPreviewAmounts] = useState<Record<string, number>>({})

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [picked, setPicked] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<ItemUnit>('g')

  const reload = useCallback(async () => {
    const fresh = await getRecipe(recipeId)
    const list = fresh?.recipe_items ?? []
    setItems(list)
    const ids = list.map(i => i.food_id).filter(Boolean) as string[]
    const fs = await getFoodsByIds(ids)
    setFoods(new Map(fs.map(f => [f.id, f])))
  }, [recipeId])

  useEffect(() => {
    if (initialItems !== undefined) return
    void Promise.resolve().then(async () => {
      try { await reload() }
      catch (e) { toast(e instanceof Error ? e.message : 'Zutaten konnten nicht geladen werden', 'error') }
      finally { setLoading(false) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (query.trim().length < 1) { setResults([]); return }
      try { setResults(await searchFoods(query)) } catch { setResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  // Vorschau: während des Tippens zählt der eingetippte Wert, nicht der gespeicherte.
  const previewItems = items.map(i =>
    previewAmounts[i.id] !== undefined ? { ...i, amount_per_portion: previewAmounts[i.id] } : i
  )
  const n = nutritionPerPortion(previewItems, foods)

  // Callback über ref, damit eine inline übergebene Funktion keine Schleife auslöst.
  const notify = useRef(onNutrition)
  notify.current = onNutrition
  useEffect(() => {
    notify.current?.(n)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.kcal, n.protein, n.carbs, n.fat, n.cost])

  async function refresh() {
    await reload()
    await onChanged?.()
  }

  async function handleAddItem() {
    if (!picked || !amount) return
    try {
      await addRecipeItem({
        recipe_id: recipeId,
        food_id: picked.id,
        food_name: picked.name,
        amount_per_portion: parseFloat(amount.replace(',', '.')) || 0,
        unit,
        sort_order: items.length,
      })
      setPicked(null); setQuery(''); setAmount('')
      await refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Zutat konnte nicht hinzugefügt werden', 'error')
    }
  }

  async function handleDeleteItem(id: string) {
    try { await deleteRecipeItem(id); await refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Löschen fehlgeschlagen', 'error') }
  }

  async function handleCommitAmount(item: RecipeItem, value: number) {
    setEditingItemId(null)
    setPreviewAmounts(p => { const c = { ...p }; delete c[item.id]; return c })
    if (value <= 0 || value === item.amount_per_portion) return
    try { await updateRecipeItemAmount(item.id, value); await refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Menge speichern fehlgeschlagen', 'error') }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <CardLabel>Zutaten pro Portion</CardLabel>
        <span className="text-xs text-text-faint">{items.length}</span>
      </div>

      {loading && <p className="text-sm text-text-muted py-2">Laden…</p>}

      {!loading && items.length === 0 && <p className="text-sm text-text-faint py-2">Noch keine Zutaten.</p>}

      <ul>
        {items.map(item => {
          const base = toBaseUnit(item.amount_per_portion, item.unit)
          return (
            <li key={item.id} className="border-b border-border-soft last:border-0 py-2">
              {editingItemId === item.id ? (
                <div>
                  <p className="text-sm text-text mb-2">{item.food_name}</p>
                  <AmountInput
                    value={item.amount_per_portion}
                    unit={item.unit}
                    onPreview={v => setPreviewAmounts(p => ({ ...p, [item.id]: v }))}
                    onCommit={v => handleCommitAmount(item, v)}
                    onCancel={() => {
                      setEditingItemId(null)
                      setPreviewAmounts(p => { const c = { ...p }; delete c[item.id]; return c })
                    }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-text-secondary min-w-0">{item.food_name}</span>
                  <button
                    onClick={() => setEditingItemId(item.id)}
                    className="tap-inline text-sm text-text-muted px-2 py-1 rounded-button hover:bg-surface-alt"
                  >
                    {formatAmount(base.amount, base.unit)}
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    aria-label={`${item.food_name} entfernen`}
                    className="tap-inline text-text-faint hover:text-danger px-1"
                  >
                    ×
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Zutat hinzufügen */}
      <div className="mt-4 pt-4 border-t border-border-soft">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setPicked(null) }}
            placeholder="Lebensmittel suchen…"
            className="w-full min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none placeholder:text-text-faint"
          />
          {results.length > 0 && !picked && (
            <ul className="absolute z-10 left-0 right-0 top-full mt-1 rounded-inner bg-surface border border-border shadow-float max-h-52 overflow-y-auto">
              {results.map(f => (
                <li key={f.id}>
                  <button
                    onMouseDown={() => {
                      setPicked(f); setQuery(f.name); setResults([])
                      setUnit(unitsForFood(f.unit)[0])
                    }}
                    className="w-full text-left px-3 py-2.5 text-sm text-text hover:bg-surface-alt"
                  >
                    {f.name}
                    <span className="text-xs text-text-muted ml-2">{f.calories_per_100} kcal</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {picked && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem()}
              placeholder="Menge"
              className="flex-1 min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none placeholder:text-text-faint"
            />
            <select
              value={unit}
              onChange={e => setUnit(e.target.value as ItemUnit)}
              className="min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none"
            >
              {unitsForFood(picked.unit).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <Button onClick={handleAddItem} disabled={!amount}>+</Button>
          </div>
        )}
      </div>
    </>
  )
}
