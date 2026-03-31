'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { calcNutrition, sumItems } from '@/lib/calculations'

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
  unit: 'g' | 'ml'
}

interface Item {
  food_id: string
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  cost: number
}

interface Template {
  id: string
  name: string
  meal_template_items: Array<{
    id: string
    amount: number
    unit: string
    foods: Food
  }>
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
  }) => void
}

export default function MealModal({ mealType, onClose, onSave }: Props) {
  const [mealName, setMealName] = useState('')
  const [items, setItems] = useState<Item[]>([])

  // Food search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Food[]>([])
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Amount input
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')

  // Template
  const [templates, setTemplates] = useState<Template[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  // Load templates for this meal type
  useEffect(() => {
    supabase
      .from('meal_templates')
      .select('*, meal_template_items(*, foods(*))')
      .eq('meal_type', mealType)
      .order('name')
      .then(({ data }) => setTemplates(data || []))
  }, [mealType])

  // Debounced food search
  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('foods')
        .select('*')
        .ilike('name', `%${searchQuery}%`)
        .order('name')
        .limit(8)
      setSearchResults(data || [])
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
    setUnit(food.unit === 'ml' ? 'ml' : 'g')
    setAmount('')
  }

  function addItem() {
    if (!selectedFood || !amount) return
    const n = calcNutrition(selectedFood, parseFloat(amount), unit)
    setItems(prev => [...prev, {
      food_id:   selectedFood.id,
      food_name: selectedFood.name,
      amount:    parseFloat(amount),
      unit,
      kcal:      n.kcal,
      protein:   n.protein,
      cost:      n.cost,
    }])
    setSelectedFood(null)
    setSearchQuery('')
    setAmount('')
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function applyTemplate(t: Template) {
    setMealName(t.name)
    const preItems: Item[] = t.meal_template_items.map(ti => {
      const n = calcNutrition(ti.foods, ti.amount, ti.unit)
      return {
        food_id:   ti.foods.id,
        food_name: ti.foods.name,
        amount:    ti.amount,
        unit:      ti.unit,
        kcal:      n.kcal,
        protein:   n.protein,
        cost:      n.cost,
      }
    })
    setItems(preItems)
    setShowTemplates(false)
  }

  const totals = sumItems(items)

  const preview = selectedFood && amount
    ? calcNutrition(selectedFood, parseFloat(amount) || 0, unit)
    : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 text-sm">
            {MEAL_TYPE_LABELS[mealType]} hinzufügen
          </h2>
          {templates.length > 0 && (
            <button
              onClick={() => setShowTemplates(v => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {showTemplates ? 'Schliessen' : 'Vorlage laden'}
            </button>
          )}
        </div>

        {/* Template picker */}
        {showTemplates && (
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-medium text-gray-500 mb-2">Vorlage auswählen</p>
            <div className="space-y-1">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-white hover:shadow-sm transition-all"
                >
                  {t.name}
                  <span className="text-xs text-gray-400 ml-2">
                    {t.meal_template_items?.length} Zutaten
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="p-6 space-y-5">

          {/* Meal name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Name der Mahlzeit</label>
            <input
              type="text"
              value={mealName}
              onChange={e => setMealName(e.target.value)}
              placeholder="z.B. Porridge"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Add ingredient */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-medium text-gray-600">Zutat hinzufügen</p>

            {/* Search */}
            <div className="relative" ref={searchRef}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSelectedFood(null) }}
                placeholder="Lebensmittel suchen…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchResults.length > 0 && (
                <ul className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                  {searchResults.map(food => (
                    <li
                      key={food.id}
                      onMouseDown={() => selectFood(food)}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-900">{food.name}</span>
                      <span className="text-gray-400 text-xs ml-2">
                        {food.calories_per_100} kcal · {food.protein_per_100}g P · CHF {Number(food.cost_per_100).toFixed(2)}/100{food.unit}
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
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {selectedFood?.unit === 'ml' ? (
                  <>
                    <option value="ml">ml</option>
                    <option value="dl">dl</option>
                    <option value="l">l</option>
                  </>
                ) : (
                  <option value="g">g</option>
                )}
              </select>
              <button
                onClick={addItem}
                disabled={!selectedFood || !amount}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors"
              >
                +
              </button>
            </div>

            {/* Live preview */}
            {preview && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                {preview.kcal} kcal · {preview.protein}g Protein · CHF {preview.cost.toFixed(2)}
              </div>
            )}
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">Zutaten</p>
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-gray-900 truncate">{item.food_name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{item.amount}{item.unit}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs text-gray-500">{item.kcal} kcal</span>
                      <span className="text-xs text-gray-500">{item.protein}g P</span>
                      <span className="text-xs text-gray-500">CHF {item.cost.toFixed(2)}</span>
                      <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-400 text-base leading-none">×</button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Totals */}
              <div className="flex gap-4 mt-2 px-3 text-xs font-semibold text-gray-700">
                <span>{Math.round(totals.kcal)} kcal</span>
                <span>{totals.protein}g Protein</span>
                <span>CHF {totals.cost.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Save as template */}
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={e => setSaveAsTemplate(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600"
              />
              Als Vorlage speichern
            </label>
            {saveAsTemplate && (
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Name der Vorlage"
                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              if (!mealName || items.length === 0) return
              onSave({ mealName, items, totals, saveAsTemplate, templateName, mealType })
            }}
            disabled={!mealName || items.length === 0}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}
