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
  unit: 'g' | 'ml' | 'stk'
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
    setUnit(food.unit === 'ml' ? 'ml' : food.unit === 'stk' ? 'stk' : 'g')
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

  const inputStyle: React.CSSProperties = {
    background: 'white',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  }

  const selectStyle: React.CSSProperties = {
    background: 'white',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
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
        style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}
      >

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #f1f5f9' }}
        >
          <h2 className="font-semibold text-sm" style={{ color: '#1e293b' }}>
            {MEAL_TYPE_LABELS[mealType]} hinzufügen
          </h2>
          {templates.length > 0 && (
            <button
              onClick={() => setShowTemplates(v => !v)}
              className="text-xs font-medium transition-colors"
              style={{ color: '#475569' }}
            >
              {showTemplates ? 'Schliessen' : 'Vorlage laden'}
            </button>
          )}
        </div>

        {/* Template picker */}
        {showTemplates && (
          <div
            className="px-6 py-3"
            style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>Vorlage auswählen</p>
            <div className="space-y-1">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors"
                  style={{ background: 'transparent', color: '#1e293b' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f1f5f9')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                >
                  {t.name}
                  <span className="text-xs ml-2" style={{ color: '#64748b' }}>
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
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name der Mahlzeit</label>
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
            style={{ border: '1px solid #f1f5f9', background: '#f8fafc' }}
          >
            <p className="text-xs font-medium" style={{ color: '#64748b' }}>Zutat hinzufügen</p>

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
                  style={{ background: 'white', border: '1px solid #e2e8f0' }}
                >
                  {searchResults.map(food => (
                    <li
                      key={food.id}
                      onMouseDown={() => selectFood(food)}
                      className="px-3 py-2 text-sm cursor-pointer transition-colors"
                      style={{ color: '#1e293b' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f1f5f9')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                    >
                      <span className="font-medium">{food.name}</span>
                      <span className="text-xs ml-2" style={{ color: '#64748b' }}>
                        {food.calories_per_100} kcal · {food.protein_per_100}g P · CHF {Number(food.cost_per_100).toFixed(2)}{food.unit === 'stk' ? '/Stück' : `/100${food.unit}`}
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
                  <option value="stk">Stk.</option>
                ) : (
                  <option value="g">g</option>
                )}
              </select>
              <button
                onClick={addItem}
                disabled={!selectedFood || !amount}
                className="text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                style={{ background: '#475569' }}
              >
                +
              </button>
            </div>

            {/* Live preview */}
            {preview && (
              <div
                className="text-xs rounded-lg px-3 py-2"
                style={{ color: '#64748b', background: '#f1f5f9' }}
              >
                {preview.kcal} kcal · {preview.protein}g Protein · CHF {preview.cost.toFixed(2)}
              </div>
            )}
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>Zutaten</p>
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: '1px solid #f1f5f9' }}
              >
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2"
                    style={i > 0 ? { borderTop: '1px solid #f1f5f9' } : {}}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: '#1e293b' }}>{item.food_name}</span>
                      <span className="text-xs shrink-0" style={{ color: '#64748b' }}>{item.amount}{item.unit}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <span className="text-xs" style={{ color: '#94a3b8' }}>{item.kcal} kcal</span>
                      <span className="text-xs" style={{ color: '#94a3b8' }}>{item.protein}g P</span>
                      <span className="text-xs" style={{ color: '#94a3b8' }}>CHF {item.cost.toFixed(2)}</span>
                      <button
                        onClick={() => removeItem(i)}
                        className="text-base leading-none transition-colors"
                        style={{ color: '#475569' }}
                        onMouseEnter={e => ((e.target as HTMLElement).style.color = '#f87171')}
                        onMouseLeave={e => ((e.target as HTMLElement).style.color = '#475569')}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {/* Totals */}
              <div className="flex gap-4 mt-2 px-3 text-xs font-semibold" style={{ color: '#64748b' }}>
                <span>{Math.round(totals.kcal)} kcal</span>
                <span>{totals.protein}g Protein</span>
                <span>CHF {totals.cost.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Save as template */}
          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: '#64748b' }}>
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={e => setSaveAsTemplate(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: '#475569' }}
              />
              Als Vorlage speichern
            </label>
            {saveAsTemplate && (
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Name der Vorlage"
                style={{ ...inputStyle, marginTop: '0.5rem' }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex justify-end gap-2"
          style={{ borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              if (!mealName || items.length === 0) return
              onSave({ mealName, items, totals, saveAsTemplate, templateName, mealType })
            }}
            disabled={!mealName || items.length === 0}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            style={{ background: '#475569' }}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}
