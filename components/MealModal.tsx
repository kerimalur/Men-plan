'use client'

import { useState, useEffect, useRef } from 'react'
import { getFoodsByIds, searchFoods, createFood } from '@/lib/db/foods'
import { calcNutrition, sumItems } from '@/lib/calculations'
import type { MealTypeKey } from '@/lib/mealTypes'
import type { Recipe } from '@/lib/db/types'
import { formatAmount, toBaseUnit } from '@/lib/units'
import RecipePicker from '@/components/RecipePicker'
import AmountInput from '@/components/ui/AmountInput'

const MEAL_TYPE_LABELS: Record<string, string> = {
  fruehstueck: 'Frühstück',
  mittagessen: 'Mittagessen',
  abendessen:  'Abendessen',
  snack:       'Snack',
}

interface Food {
  id: string
  name: string
  calories_per_100: number
  protein_per_100: number
  cost_per_100: number
  unit: 'g' | 'ml' | 'stk'
  calories_per_100g?: number | null
  protein_per_100g?: number | null
}

interface Item {
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  cost: number
  isCustom?: boolean
  customKcalPer100?: number
  customProteinPer100?: number
  isQuick?: boolean
}

export interface ExistingMeal {
  id: string
  name: string
  meal_type: string
  items: { food_id: string | null; food_name: string; amount: number; unit: string; kcal: number; protein: number; carbs?: number; fat?: number; cost: number }[]
}

interface Props {
  mealType: string
  onClose: () => void
  onSave: (data: {
    mealName: string
    items: Item[]
    totals: { kcal: number; protein: number; cost: number }
    saveAsTemplate: boolean
    templateName: string
    mealType: string
    customFoods?: Item[]
    existingMealId?: string
  }) => void
  existingMeal?: ExistingMeal
}

export default function MealModal({ mealType, onClose, onSave, existingMeal }: Props) {
  const [mealName, setMealName] = useState(existingMeal?.name || '')
  const [items, setItems] = useState<Item[]>(
    existingMeal?.items.map(i => ({
      food_id: i.food_id, food_name: i.food_name, amount: i.amount,
      unit: i.unit, kcal: i.kcal, protein: i.protein,
      carbs: i.carbs ?? 0, fat: i.fat ?? 0, cost: i.cost,
    })) || []
  )

  // Mode: 'search' for DB foods, 'custom' for manual entry, 'quick' for kcal/protein/price only
  const [addMode, setAddMode] = useState<'search' | 'custom' | 'quick'>('search')

  // Food search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Food[]>([])
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Amount input
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')

  // Inline-Bearbeitung einer bereits erfassten Zutat
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // Rezept als Startpunkt laden bzw. die Mahlzeit als Rezept sichern
  const [showRecipes, setShowRecipes] = useState(false)
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Custom food fields
  const [customName, setCustomName] = useState('')
  const [customKcal, setCustomKcal] = useState('')
  const [customProtein, setCustomProtein] = useState('')
  const [customCost, setCustomCost]       = useState('')
  const [customAmount, setCustomAmount]   = useState('')
  const [customUnit, setCustomUnit]       = useState('g')
  const [savingCustomFood, setSavingCustomFood] = useState(false)

  // Quick entry fields (only kcal/protein/price for the whole meal)
  const [quickKcal, setQuickKcal] = useState('')
  const [quickProtein, setQuickProtein] = useState('')
  const [quickCost, setQuickCost] = useState('')

  // Save-to-DB prompt
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [pendingSaveData, setPendingSaveData] = useState<Parameters<typeof onSave>[0] | null>(null)
  const [newFoodPrices, setNewFoodPrices] = useState<Record<number, string>>({})
  const [savingFoods, setSavingFoods] = useState(false)


  // Debounced food search
  useEffect(() => {
    const t = setTimeout(async () => {
      if (searchQuery.length < 1) { setSearchResults([]); return }
      try { setSearchResults(await searchFoods(searchQuery)) }
      catch { setSearchResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectFood(food: Food) {
    setSelectedFood(food)
    setSearchQuery(food.name)
    setSearchResults([])
    setUnit(food.unit === 'ml' ? 'ml' : food.unit === 'stk' ? 'stk' : 'g')
    setAmount('')
  }

  function effectiveFood(food: Food, selectedUnit: string): { calories_per_100: number; protein_per_100: number; cost_per_100: number } {
    if (selectedUnit === 'g' && food.unit === 'stk' && food.calories_per_100g != null) {
      return { calories_per_100: food.calories_per_100g, protein_per_100: food.protein_per_100g || 0, cost_per_100: 0 }
    }
    return food
  }

  function addItem() {
    if (!selectedFood || !amount) return
    const ef = effectiveFood(selectedFood, unit)
    const calcUnit = (unit === 'g' && selectedFood.unit === 'stk') ? 'g' : unit
    const n = calcNutrition(ef, parseFloat(amount), calcUnit)
    setItems(prev => [...prev, {
      food_id:   selectedFood.id,
      food_name: selectedFood.name,
      amount:    parseFloat(amount),
      unit:      calcUnit,
      kcal:      n.kcal,
      protein:   n.protein,
      carbs:     n.carbs,
      fat:       n.fat,
      cost:      n.cost,
    }])
    setSelectedFood(null)
    setSearchQuery('')
    setAmount('')
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  /**
   * Menge einer bereits erfassten Zutat ändern.
   *
   * Nährwerte und Kosten skalieren proportional — dieselbe Rechnung wie
   * updateMealItemAmount() in lib/db/plans.ts. Das kommt ohne erneuten Zugriff
   * auf das Lebensmittel aus und funktioniert auch für Direkteingaben.
   */
  function setItemAmount(index: number, newAmount: number) {
    setEditingIndex(null)
    setItems(prev => prev.map((it, i) => {
      if (i !== index || newAmount <= 0 || it.amount <= 0 || newAmount === it.amount) return it
      const r = newAmount / it.amount
      return {
        ...it,
        amount:  newAmount,
        kcal:    Math.round(it.kcal    * r * 10)   / 10,
        protein: Math.round(it.protein * r * 10)   / 10,
        carbs:   Math.round(it.carbs   * r * 10)   / 10,
        fat:     Math.round(it.fat     * r * 10)   / 10,
        cost:    Math.round(it.cost    * r * 1000) / 1000,
      }
    }))
  }

  function addCustomItem() {
    if (!customName.trim() || !customAmount || !customKcal) return
    const amt = parseFloat(customAmount)
    const kcalPer100 = parseFloat(customKcal) || 0
    const protPer100 = parseFloat(customProtein) || 0
    const costPer100 = parseFloat(customCost) || 0
    const factor = customUnit === 'stk' ? amt : amt / 100
    setItems(prev => [...prev, {
      food_id:   null,
      food_name: customName.trim(),
      amount:    amt,
      unit:      customUnit,
      kcal:      Math.round(kcalPer100 * factor * 10) / 10,
      protein:   Math.round(protPer100 * factor * 10) / 10,
      // Direkteingabe erfasst keine Makros -- werden spaeter nachgepflegt.
      carbs:     0,
      fat:       0,
      cost:      Math.round(costPer100 * factor * 100) / 100,
      isCustom:  true,
      customKcalPer100: kcalPer100,
      customProteinPer100: protPer100,
    }])
    setCustomName(''); setCustomKcal(''); setCustomProtein(''); setCustomCost(''); setCustomAmount('')
  }

  async function saveCustomFoodToDB() {
    if (!customName.trim() || !customKcal) return
    setSavingCustomFood(true)
    const dbUnit = customUnit === 'stk' ? 'stk' : customUnit === 'ml' ? 'ml' : 'g'
    const newFood = await createFood({
      name: customName.trim(),
      calories_per_100: parseFloat(customKcal) || 0,
      protein_per_100:  parseFloat(customProtein) || 0,
      cost_per_100:     parseFloat(customCost) || 0,
      unit: dbUnit,
    })
    setSavingCustomFood(false)
    if (newFood) {
      // Switch to search mode with the newly saved food pre-selected
      setAddMode('search')
      setSelectedFood(newFood as Food)
      setSearchQuery(newFood.name)
      setUnit(dbUnit === 'ml' ? 'ml' : dbUnit === 'stk' ? 'stk' : 'g')
      setCustomName(''); setCustomKcal(''); setCustomProtein(''); setCustomCost('')
    }
  }

  function addQuickItem() {
    if (!quickKcal) return
    setItems(prev => [...prev, {
      food_id:   null,
      food_name: mealName.trim() || 'Direkteingabe',
      amount:    1,
      unit:      'stk',
      kcal:      parseFloat(quickKcal) || 0,
      protein:   parseFloat(quickProtein) || 0,
      carbs:     0,
      fat:       0,
      cost:      parseFloat(quickCost) || 0,
      isQuick:   true,
    }])
    setQuickKcal(''); setQuickProtein(''); setQuickCost('')
  }

  function handleFinishSave() {
    if (!mealName || items.length === 0) return
    const customFoods = items.filter(i => i.isCustom)
    const data = { mealName, items, totals, saveAsTemplate, templateName, mealType, customFoods, existingMealId: existingMeal?.id }
    if (customFoods.length > 0) {
      setPendingSaveData(data)
      setShowSavePrompt(true)
    } else {
      onSave(data)
    }
  }

  async function confirmSaveNewFoods(saveToDB: boolean) {
    if (!pendingSaveData) return
    // Build up a local copy — state objects must not be mutated in place.
    let saveData = pendingSaveData
    if (saveToDB) {
      setSavingFoods(true)
      const customItems = saveData.customFoods || []
      for (let i = 0; i < customItems.length; i++) {
        const ci = customItems[i]
        const price = parseFloat(newFoodPrices[i] || '0') || 0
        const newFood = await createFood({
          name: ci.food_name,
          calories_per_100: ci.customKcalPer100 || 0,
          protein_per_100: ci.customProteinPer100 || 0,
          cost_per_100: price,
          unit: ci.unit === 'stk' ? 'stk' : ci.unit === 'ml' || ci.unit === 'dl' || ci.unit === 'l' ? 'ml' : 'g',
        })
        if (newFood) {
          // Update the item's food_id so it's linked
          saveData = {
            ...saveData,
            items: saveData.items.map(item =>
              item.food_name === ci.food_name && item.isCustom
                ? { ...item, food_id: newFood.id, cost: Math.round(price * (ci.unit === 'stk' ? ci.amount : ci.amount / 100) * 1000) / 1000, isCustom: false }
                : item
            ),
          }
        }
      }
      // Recalc totals with updated costs
      const newTotals = saveData.items.reduce(
        (acc, item) => ({ kcal: acc.kcal + item.kcal, protein: acc.protein + item.protein, cost: acc.cost + item.cost }),
        { kcal: 0, protein: 0, cost: 0 }
      )
      saveData = {
        ...saveData,
        totals: {
          kcal: Math.round(newTotals.kcal * 10) / 10,
          protein: Math.round(newTotals.protein * 10) / 10,
          cost: Math.round(newTotals.cost * 1000) / 1000,
        },
      }
      setSavingFoods(false)
    }
    onSave(saveData)
  }

  /**
   * Rezept als Startpunkt übernehmen.
   *
   * recipe_items führen Mengen PRO PORTION. Eine frei geplante Mahlzeit ist
   * genau eine Portion, deshalb werden sie 1:1 übernommen.
   */
  async function applyRecipe(recipe: Recipe) {
    setShowRecipes(false)
    setMealName(recipe.name)
    const recipeItems = recipe.recipe_items ?? []
    const foods = await getFoodsByIds(recipeItems.map(i => i.food_id).filter(Boolean) as string[])
    const byId = new Map(foods.map(f => [f.id, f]))
    setItems(recipeItems.map(ri => {
      const food = ri.food_id ? byId.get(ri.food_id) : undefined
      const n = food
        ? calcNutrition(food, ri.amount_per_portion, ri.unit)
        : { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 }
      return {
        food_id:   ri.food_id,
        food_name: ri.food_name,
        amount:    ri.amount_per_portion,
        unit:      ri.unit,
        kcal:      n.kcal,
        protein:   n.protein,
        carbs:     n.carbs,
        fat:       n.fat,
        cost:      n.cost,
      }
    }))
  }

  const totals = sumItems(items)

  const preview = selectedFood && amount
    ? calcNutrition(effectiveFood(selectedFood, unit), parseFloat(amount) || 0, (unit === 'g' && selectedFood.unit === 'stk') ? 'g' : unit)
    : null

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  }

  const selectStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.5rem',
    fontSize: '0.875rem',
    outline: 'none',
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '0.75rem' }}
      >

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-border-soft)' }}
        >
          <h2 className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
            {existingMeal ? `${MEAL_TYPE_LABELS[mealType]} bearbeiten` : `${MEAL_TYPE_LABELS[mealType]} hinzufügen`}
          </h2>
          <button
            onClick={() => setShowRecipes(true)}
            className="text-xs font-medium transition-colors"
            style={{ color: 'var(--color-accent)' }}
          >
            Rezept laden
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Meal name */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Name der Mahlzeit</label>
            <input
              type="text"
              value={mealName}
              onChange={e => setMealName(e.target.value)}
              placeholder="z.B. Porridge"
              style={inputStyle}
            />
          </div>

          {/* Add ingredient */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{ border: '1px solid var(--color-border-soft)', background: 'var(--color-surface-alt)' }}
          >
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAddMode('search')}
                className="text-xs font-medium px-3 py-1 rounded-lg transition-colors"
                style={addMode === 'search'
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-text)' }
                  : { background: 'var(--color-border-soft)', color: 'var(--color-text-secondary)' }}
              >
                Aus Datenbank
              </button>
              <button
                onClick={() => setAddMode('custom')}
                className="text-xs font-medium px-3 py-1 rounded-lg transition-colors"
                style={addMode === 'custom'
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-text)' }
                  : { background: 'var(--color-border-soft)', color: 'var(--color-text-secondary)' }}
              >
                Eigenes Lebensmittel
              </button>
              <button
                onClick={() => setAddMode('quick')}
                className="text-xs font-medium px-3 py-1 rounded-lg transition-colors"
                style={addMode === 'quick'
                  ? { background: 'var(--color-accent)', color: 'var(--color-accent-text)' }
                  : { background: 'var(--color-border-soft)', color: 'var(--color-text-secondary)' }}
              >
                Schnelleingabe
              </button>
            </div>

            {addMode === 'search' ? (
              <>
                {/* Search */}
                <div className="relative" ref={searchRef}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSelectedFood(null) }}
                    placeholder="Lebensmittel suchen…"
                    style={inputStyle}
                  />
                  {searchResults.length > 0 && (
                    <ul
                      className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg shadow-xl max-h-44 overflow-y-auto"
                      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                    >
                      {searchResults.map(food => (
                        <li
                          key={food.id}
                          onMouseDown={() => selectFood(food)}
                          className="px-3 py-2 text-sm cursor-pointer transition-colors"
                          style={{ color: 'var(--color-text)' }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--color-border-soft)')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                        >
                          <span className="font-medium">{food.name}</span>
                          <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>
                            {food.calories_per_100} kcal · {food.protein_per_100}g P · CHF {Number(food.cost_per_100).toFixed(2)}{food.unit === 'stk' ? '/Stück' : `/100${food.unit}`}
                            {food.unit === 'stk' && food.calories_per_100g != null && (
                              <span style={{ color: 'var(--color-success)' }}> · auch in g</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Amount + unit + add */}
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addItem()}
                    placeholder="Menge"
                    min="0"
                    step="1"
                    style={{ ...inputStyle, width: undefined, flex: 1 }}
                  />
                  <select
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    style={selectStyle}
                  >
                    {selectedFood?.unit === 'ml' ? (
                      <>
                        <option value="ml">ml</option>
                        <option value="dl">dl</option>
                        <option value="l">l</option>
                      </>
                    ) : selectedFood?.unit === 'stk' ? (
                      <>
                        <option value="stk">Stk.</option>
                        {selectedFood.calories_per_100g != null && (
                          <option value="g">g</option>
                        )}
                      </>
                    ) : (
                      <option value="g">g</option>
                    )}
                  </select>
                  <button
                    onClick={addItem}
                    disabled={!selectedFood || !amount}
                    className="text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--color-accent)' }}
                  >
                    +
                  </button>
                </div>

                {/* Live preview */}
                {preview && (
                  <div
                    className="text-xs rounded-lg px-3 py-2"
                    style={{ color: 'var(--color-text-secondary)', background: 'var(--color-border-soft)' }}
                  >
                    {preview.kcal} kcal · {preview.protein}g Protein · CHF {preview.cost.toFixed(2)}
                  </div>
                )}
              </>
            ) : addMode === 'custom' ? (
              <>
                {/* Custom food form */}
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Name (z.B. Mehl, Honig…)"
                  style={inputStyle}
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    value={customKcal}
                    onChange={e => setCustomKcal(e.target.value)}
                    placeholder="kcal/100g"
                    min="0"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={customProtein}
                    onChange={e => setCustomProtein(e.target.value)}
                    placeholder="Protein/100g"
                    min="0"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={customCost}
                    onChange={e => setCustomCost(e.target.value)}
                    placeholder="CHF/100g"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </div>
                {/* Inline save to DB */}
                <button
                  onClick={saveCustomFoodToDB}
                  disabled={!customName.trim() || !customKcal || savingCustomFood}
                  className="w-full py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 transition-opacity hover:opacity-80"
                  style={{ background: 'var(--color-sage-soft)', color: 'var(--color-sage)', border: '1px solid var(--color-sage)' }}
                >
                  {savingCustomFood ? 'Speichern…' : '✨ In Datenbank speichern & Menge eingeben'}
                </button>
                <div style={{ borderTop: '1px solid var(--color-border-soft)', paddingTop: '0.5rem' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Oder direkt hinzufügen (ohne Datenbank):</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={customAmount}
                      onChange={e => setCustomAmount(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCustomItem()}
                      placeholder="Menge"
                      min="0"
                      step="1"
                      style={{ ...inputStyle, width: undefined, flex: 1 }}
                    />
                    <select
                      value={customUnit}
                      onChange={e => setCustomUnit(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="stk">Stk.</option>
                    </select>
                    <button
                      onClick={addCustomItem}
                      disabled={!customName.trim() || !customAmount || !customKcal}
                      className="text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Quick entry: just kcal/protein/price for the whole meal */}
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    value={quickKcal}
                    onChange={e => setQuickKcal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuickItem()}
                    placeholder="kcal"
                    min="0"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={quickProtein}
                    onChange={e => setQuickProtein(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuickItem()}
                    placeholder="Protein g"
                    min="0"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    value={quickCost}
                    onChange={e => setQuickCost(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuickItem()}
                    placeholder="CHF"
                    min="0"
                    step="0.01"
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={addQuickItem}
                  disabled={!quickKcal}
                  className="w-full text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--color-accent)' }}
                >
                  Hinzufügen
                </button>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Nur Kalorien, Protein und ungefährer Preis für die ganze Mahlzeit – ohne einzelne Lebensmittel.
                </p>
              </>
            )}
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Zutaten</p>
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid var(--color-border-soft)' }}
              >
                {items.map((item, i) => {
                  const base = toBaseUnit(item.amount, item.unit)
                  return (
                    <div
                      key={i}
                      className="px-3 py-2"
                      style={i > 0 ? { borderTop: '1px solid var(--color-border-soft)' } : {}}
                    >
                      {editingIndex === i ? (
                        <div>
                          <p className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>{item.food_name}</p>
                          <AmountInput
                            value={item.amount}
                            unit={item.unit}
                            onCommit={v => setItemAmount(i, v)}
                            onCancel={() => setEditingIndex(null)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{item.food_name}</span>
                            {item.isCustom && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}>eigen</span>
                            )}
                            {item.isQuick && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'var(--color-sage-soft)', color: 'var(--color-sage)' }}>schnell</span>
                            )}
                            {!item.isQuick && (
                              <button
                                onClick={() => setEditingIndex(i)}
                                className="text-xs shrink-0 px-2 py-0.5 rounded-lg transition-colors"
                                style={{ color: 'var(--color-text-secondary)', background: 'var(--color-border-soft)' }}
                              >
                                {formatAmount(base.amount, base.unit)}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-3">
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.kcal} kcal</span>
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.protein}g P</span>
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>CHF {item.cost.toFixed(2)}</span>
                            <button
                              onClick={() => removeItem(i)}
                              className="text-base leading-none transition-colors"
                              style={{ color: 'var(--color-accent)' }}
                              onMouseEnter={e => ((e.target as HTMLElement).style.color = 'var(--color-danger)')}
                              onMouseLeave={e => ((e.target as HTMLElement).style.color = 'var(--color-accent)')}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* Totals */}
              <div className="flex gap-4 mt-2 px-3 text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                <span>{Math.round(totals.kcal)} kcal</span>
                <span>{totals.protein}g Protein</span>
                <span>CHF {totals.cost.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Save as template */}
          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={e => setSaveAsTemplate(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: 'var(--color-accent)' }}
              />
              Als Rezept speichern
            </label>
            {saveAsTemplate && (
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Name des Rezepts"
                style={{ ...inputStyle, marginTop: '0.5rem' }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex justify-end gap-2"
          style={{ borderTop: '1px solid var(--color-border-soft)', background: 'var(--color-surface-alt)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{ background: 'var(--color-border-soft)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleFinishSave}
            disabled={!mealName || items.length === 0}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            style={{ background: 'var(--color-accent)' }}
          >
            Speichern
          </button>
        </div>

        {/* Save-to-DB prompt for custom foods */}
        {showSavePrompt && pendingSaveData && (
          <div
            className="fixed inset-0 flex items-center justify-center z-[60] p-4"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          >
            <div
              className="w-full max-w-md shadow-xl overflow-y-auto max-h-[80vh]"
              style={{ background: 'var(--color-surface)', borderRadius: '0.75rem', border: '1px solid var(--color-border)' }}
            >
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--color-border-soft)' }}>
                <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>Neue Lebensmittel erkannt</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  Sollen diese in die Datenbank aufgenommen werden? Bitte Preis pro 100g/ml/Stk. eingeben.
                </p>
              </div>
              <div className="p-6 space-y-4">
                {(pendingSaveData.customFoods || []).map((cf, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ border: '1px solid var(--color-border-soft)', background: 'var(--color-surface-alt)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{cf.food_name}</span>
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{cf.kcal} kcal · {cf.protein}g P</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs shrink-0" style={{ color: 'var(--color-text-secondary)' }}>CHF pro {cf.unit === 'stk' ? 'Stk.' : `100${cf.unit}`}:</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newFoodPrices[i] || ''}
                        onChange={e => setNewFoodPrices(prev => ({ ...prev, [i]: e.target.value }))}
                        placeholder="0.00"
                        style={{
                          flex: 1, background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)',
                          borderRadius: '0.5rem', padding: '0.375rem 0.75rem', fontSize: '0.875rem', outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid var(--color-border-soft)' }}>
                <button
                  onClick={() => confirmSaveNewFoods(false)}
                  className="px-4 py-2 text-sm rounded-lg"
                  style={{ background: 'var(--color-border-soft)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                >
                  Nein, nur tracken
                </button>
                <button
                  onClick={() => confirmSaveNewFoods(true)}
                  disabled={savingFoods}
                  className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                  style={{ background: 'var(--color-success)' }}
                >
                  {savingFoods ? 'Speichern…' : 'In Datenbank speichern'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showRecipes && (
        <RecipePicker
          mealType={mealType as MealTypeKey}
          onPick={applyRecipe}
          onClose={() => setShowRecipes(false)}
        />
      )}
    </div>
  )
}
