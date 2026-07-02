'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { calcNutrition } from '@/lib/calculations'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from '@/lib/mealTypes'
import { toDateStr, getMondayOfWeek } from '@/lib/dates'
import { useToast } from '@/components/Toast'
import type { Food } from '@/components/FoodSearch'

// ── Types ─────────────────────────────────────────────────────

interface GrossesMenuItem {
  id: string
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  cost: number
}

interface GrossesMenuMahlzeit {
  id: string
  menu_id: string
  meal_type: string
  name: string
  grosse_menu_items: GrossesMenuItem[]
}

interface GrossesMenu {
  id: string
  name: string
  num_days: number
  created_at: string
  grosse_menu_meals: GrossesMenuMahlzeit[]
}

interface EditItem {
  localId: string
  food_id: string | null
  food_name: string
  amount: number
  unit: string
  kcal: number
  protein: number
  cost: number
  isCustom?: boolean
  customKcalPer100?: number
  customProteinPer100?: number
  isQuick?: boolean
}

const DAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

// ── Add / Edit Meal Modal ─────────────────────────────────────

function AddMealModal({ menuId, existingMeal, onClose, onSaved }: {
  menuId: string
  existingMeal?: GrossesMenuMahlzeit | null
  onClose: () => void
  onSaved: () => void
}) {
  const [mealType, setMealType] = useState(existingMeal?.meal_type || 'mittagessen')
  const [name, setName] = useState(existingMeal?.name || '')
  const [items, setItems] = useState<EditItem[]>(() =>
    existingMeal?.grosse_menu_items.map(i => ({
      localId: Math.random().toString(36).slice(2),
      food_id: i.food_id,
      food_name: i.food_name,
      amount: i.amount,
      unit: i.unit,
      kcal: i.kcal,
      protein: i.protein,
      cost: i.cost,
    })) || []
  )

  const [addMode, setAddMode] = useState<'search' | 'custom' | 'quick'>('search')

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Food[]>([])
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const searchRef = useRef<HTMLDivElement>(null)

  const [customName, setCustomName] = useState('')
  const [customKcal, setCustomKcal] = useState('')
  const [customProtein, setCustomProtein] = useState('')
  const [customCost, setCustomCost] = useState('')
  const [customAmount, setCustomAmount] = useState('')
  const [customUnit, setCustomUnit] = useState('g')
  const [savingCustomFood, setSavingCustomFood] = useState(false)

  const [quickKcal, setQuickKcal] = useState('')
  const [quickProtein, setQuickProtein] = useState('')
  const [quickCost, setQuickCost] = useState('')

  const [saving, setSaving] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [pendingItems, setPendingItems] = useState<EditItem[] | null>(null)
  const [newFoodPrices, setNewFoodPrices] = useState<Record<number, string>>({})
  const [savingFoods, setSavingFoods] = useState(false)

  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('foods').select('*').ilike('name', `%${searchQuery}%`).order('name').limit(8)
      setSearchResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function effectiveFood(food: Food, sel: string) {
    if (sel === 'g' && food.unit === 'stk' && food.calories_per_100g != null) {
      return { calories_per_100: food.calories_per_100g, protein_per_100: food.protein_per_100g || 0, cost_per_100: 0 }
    }
    return food
  }

  function selectFood(food: Food) {
    setSelectedFood(food)
    setSearchQuery(food.name)
    setSearchResults([])
    setUnit(food.unit === 'ml' ? 'ml' : food.unit === 'stk' ? 'stk' : 'g')
    setAmount('')
  }

  function addItem() {
    if (!selectedFood || !amount) return
    const calcUnit = (unit === 'g' && selectedFood.unit === 'stk') ? 'g' : unit
    const n = calcNutrition(effectiveFood(selectedFood, unit), parseFloat(amount), calcUnit)
    setItems(prev => [...prev, {
      localId: Math.random().toString(36).slice(2),
      food_id: selectedFood.id,
      food_name: selectedFood.name,
      amount: parseFloat(amount),
      unit: calcUnit,
      kcal: n.kcal,
      protein: n.protein,
      cost: n.cost,
    }])
    setSelectedFood(null)
    setSearchQuery('')
    setAmount('')
  }

  function addCustomItem() {
    if (!customName.trim() || !customAmount || !customKcal) return
    const amt = parseFloat(customAmount)
    const kcalPer100 = parseFloat(customKcal) || 0
    const protPer100 = parseFloat(customProtein) || 0
    const costPer100 = parseFloat(customCost) || 0
    const factor = customUnit === 'stk' ? amt : amt / 100
    setItems(prev => [...prev, {
      localId: Math.random().toString(36).slice(2),
      food_id: null,
      food_name: customName.trim(),
      amount: amt,
      unit: customUnit,
      kcal: Math.round(kcalPer100 * factor * 10) / 10,
      protein: Math.round(protPer100 * factor * 10) / 10,
      cost: Math.round(costPer100 * factor * 100) / 100,
      isCustom: true,
      customKcalPer100: kcalPer100,
      customProteinPer100: protPer100,
    }])
    setCustomName(''); setCustomKcal(''); setCustomProtein(''); setCustomCost(''); setCustomAmount('')
  }

  async function saveCustomFoodToDB() {
    if (!customName.trim() || !customKcal) return
    setSavingCustomFood(true)
    const dbUnit = customUnit === 'stk' ? 'stk' : customUnit === 'ml' ? 'ml' : 'g'
    const { data: newFood } = await supabase.from('foods').insert({
      name: customName.trim(),
      calories_per_100: parseFloat(customKcal) || 0,
      protein_per_100: parseFloat(customProtein) || 0,
      cost_per_100: parseFloat(customCost) || 0,
      unit: dbUnit,
    }).select().single()
    setSavingCustomFood(false)
    if (newFood) {
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
      localId: Math.random().toString(36).slice(2),
      food_id: null,
      food_name: name.trim() || 'Direkteingabe',
      amount: 1,
      unit: 'stk',
      kcal: parseFloat(quickKcal) || 0,
      protein: parseFloat(quickProtein) || 0,
      cost: parseFloat(quickCost) || 0,
      isQuick: true,
    }])
    setQuickKcal(''); setQuickProtein(''); setQuickCost('')
  }

  function handleSave() {
    if (!name.trim() || items.length === 0) return
    const customFoods = items.filter(i => i.isCustom)
    if (customFoods.length > 0) {
      setPendingItems(items)
      setShowSavePrompt(true)
    } else {
      doSave(items)
    }
  }

  async function doSave(finalItems: EditItem[]) {
    setSaving(true)
    let mealId: string
    if (existingMeal) {
      await supabase.from('grosse_menu_meals')
        .update({ meal_type: mealType, name: name.trim() })
        .eq('id', existingMeal.id)
      await supabase.from('grosse_menu_items').delete().eq('menu_meal_id', existingMeal.id)
      mealId = existingMeal.id
    } else {
      const { data: meal } = await supabase
        .from('grosse_menu_meals')
        .insert({ menu_id: menuId, meal_type: mealType, name: name.trim() })
        .select().single()
      mealId = meal!.id
    }
    if (finalItems.length > 0) {
      await supabase.from('grosse_menu_items').insert(
        finalItems.map(item => ({
          menu_meal_id: mealId,
          food_id: item.food_id,
          food_name: item.food_name,
          amount: item.amount,
          unit: item.unit,
          kcal: item.kcal,
          protein: item.protein,
          cost: item.cost,
        }))
      )
    }
    setSaving(false)
    onSaved()
  }

  async function confirmSaveNewFoods(saveToDB: boolean) {
    if (!pendingItems) return
    let finalItems = [...pendingItems]
    if (saveToDB) {
      setSavingFoods(true)
      const customFoods = pendingItems.filter(i => i.isCustom)
      for (let i = 0; i < customFoods.length; i++) {
        const ci = customFoods[i]
        const price = parseFloat(newFoodPrices[i] || '0') || 0
        const { data: newFood } = await supabase.from('foods').insert({
          name: ci.food_name,
          calories_per_100: ci.customKcalPer100 || 0,
          protein_per_100: ci.customProteinPer100 || 0,
          cost_per_100: price,
          unit: ci.unit === 'stk' ? 'stk' : (ci.unit === 'ml' || ci.unit === 'dl' || ci.unit === 'l') ? 'ml' : 'g',
        }).select().single()
        if (newFood) {
          finalItems = finalItems.map(item =>
            item.food_name === ci.food_name && item.isCustom
              ? { ...item, food_id: newFood.id, cost: Math.round(price * (ci.unit === 'stk' ? ci.amount : ci.amount / 100) * 1000) / 1000, isCustom: false }
              : item
          )
        }
      }
      setSavingFoods(false)
    }
    doSave(finalItems)
  }

  const totals = items.reduce(
    (acc, item) => ({ kcal: acc.kcal + item.kcal, protein: acc.protein + item.protein, cost: acc.cost + item.cost }),
    { kcal: 0, protein: 0, cost: 0 }
  )

  const preview = selectedFood && amount
    ? calcNutrition(effectiveFood(selectedFood, unit), parseFloat(amount) || 0, (unit === 'g' && selectedFood.unit === 'stk') ? 'g' : unit)
    : null

  const inputStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.75rem', padding: '0.625rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  }
  const selectStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.75rem', padding: '0.625rem 0.5rem', fontSize: '0.875rem', outline: 'none',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>
            {existingMeal ? 'Mahlzeit bearbeiten' : 'Mahlzeit hinzufügen'}
          </h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Type + Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Mahlzeittyp</label>
              <select value={mealType} onChange={e => setMealType(e.target.value)} style={inputStyle}>
                {MEAL_TYPE_ORDER.map(k => (
                  <option key={k} value={k}>{MEAL_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="z.B. Pasta Bolognese" style={inputStyle} />
            </div>
          </div>

          {/* Add ingredient area */}
          <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Gesamtmenge für alle Tage eingeben (z.B. 900 g Pasta für 3 Tage)
            </p>

            {/* Mode toggle */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['search', 'custom', 'quick'] as const).map((mode, idx) => {
                const labels = ['Aus Datenbank', 'Eigenes Lebensmittel', 'Schnelleingabe']
                return (
                  <button key={mode} onClick={() => setAddMode(mode)}
                    className="text-xs font-medium px-3 py-1 rounded-lg transition-colors"
                    style={addMode === mode
                      ? { background: '#475569', color: 'white' }
                      : { background: '#f1f5f9', color: '#64748b' }}>
                    {labels[idx]}
                  </button>
                )
              })}
            </div>

            {addMode === 'search' ? (
              <>
                <div className="relative" ref={searchRef}>
                  <input type="text" value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSelectedFood(null) }}
                    placeholder="Lebensmittel suchen…" style={inputStyle} />
                  {searchResults.length > 0 && (
                    <ul className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl shadow-xl max-h-44 overflow-y-auto"
                      style={{ background: 'white', border: '1px solid #e2e8f0' }}>
                      {searchResults.map(food => (
                        <li key={food.id} onMouseDown={() => selectFood(food)}
                          className="px-3 py-2.5 text-sm cursor-pointer"
                          style={{ color: '#1e293b' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span className="font-medium">{food.name}</span>
                          <span className="text-xs ml-2" style={{ color: '#64748b' }}>
                            {food.calories_per_100} kcal · {food.protein_per_100}g P
                            {food.unit === 'stk' && food.calories_per_100g != null && (
                              <span style={{ color: '#059669' }}> · auch in g</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex gap-2">
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addItem()}
                    placeholder="Menge" min="0" step="1"
                    style={{ ...inputStyle, flex: 1, width: undefined }} />
                  <select value={unit} onChange={e => setUnit(e.target.value)} style={selectStyle}>
                    {selectedFood?.unit === 'ml' ? (
                      <><option value="ml">ml</option><option value="dl">dl</option><option value="l">l</option></>
                    ) : selectedFood?.unit === 'stk' ? (
                      <>
                        <option value="stk">Stk.</option>
                        {selectedFood.calories_per_100g != null && <option value="g">g</option>}
                      </>
                    ) : (
                      <option value="g">g</option>
                    )}
                  </select>
                  <button onClick={addItem} disabled={!selectedFood || !amount}
                    className="px-4 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: '#475569' }}>+</button>
                </div>
                {preview && (
                  <div className="text-xs rounded-lg px-3 py-2" style={{ color: '#64748b', background: '#f1f5f9' }}>
                    {preview.kcal} kcal · {preview.protein}g Protein · CHF {preview.cost.toFixed(2)}
                  </div>
                )}
              </>
            ) : addMode === 'custom' ? (
              <>
                <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                  placeholder="Name (z.B. Mehl, Honig…)" style={inputStyle} />
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" value={customKcal} onChange={e => setCustomKcal(e.target.value)}
                    placeholder="kcal/100g" min="0" style={inputStyle} />
                  <input type="number" value={customProtein} onChange={e => setCustomProtein(e.target.value)}
                    placeholder="Protein/100g" min="0" style={inputStyle} />
                  <input type="number" value={customCost} onChange={e => setCustomCost(e.target.value)}
                    placeholder="CHF/100g" min="0" step="0.01" style={inputStyle} />
                </div>
                <button onClick={saveCustomFoodToDB}
                  disabled={!customName.trim() || !customKcal || savingCustomFood}
                  className="w-full py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                  style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
                  {savingCustomFood ? 'Speichern…' : '✨ In Datenbank speichern & Menge eingeben'}
                </button>
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                  <p className="text-xs mb-2" style={{ color: '#94a3b8' }}>Oder direkt hinzufügen (ohne Datenbank):</p>
                  <div className="flex gap-2">
                    <input type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCustomItem()}
                      placeholder="Menge" min="0" step="1"
                      style={{ ...inputStyle, flex: 1, width: undefined }} />
                    <select value={customUnit} onChange={e => setCustomUnit(e.target.value)} style={selectStyle}>
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="stk">Stk.</option>
                    </select>
                    <button onClick={addCustomItem}
                      disabled={!customName.trim() || !customAmount || !customKcal}
                      className="px-4 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                      style={{ background: '#475569' }}>+</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" value={quickKcal} onChange={e => setQuickKcal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuickItem()}
                    placeholder="kcal" min="0" style={inputStyle} />
                  <input type="number" value={quickProtein} onChange={e => setQuickProtein(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuickItem()}
                    placeholder="Protein g" min="0" style={inputStyle} />
                  <input type="number" value={quickCost} onChange={e => setQuickCost(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuickItem()}
                    placeholder="CHF" min="0" step="0.01" style={inputStyle} />
                </div>
                <button onClick={addQuickItem} disabled={!quickKcal}
                  className="w-full text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                  style={{ background: '#475569' }}>
                  Hinzufügen
                </button>
                <p className="text-xs" style={{ color: '#94a3b8' }}>
                  Nur Kalorien, Protein und ungefährer Preis – ohne einzelne Lebensmittel.
                </p>
              </>
            )}
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>Zutaten ({items.length})</p>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f1f5f9' }}>
                {items.map((item, i) => (
                  <div key={item.localId} className="flex items-center justify-between px-3 py-2.5"
                    style={i > 0 ? { borderTop: '1px solid #f1f5f9' } : {}}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: '#1e293b' }}>{item.food_name}</span>
                      {item.isCustom && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: '#fef3c7', color: '#92400e' }}>eigen</span>
                      )}
                      {item.isQuick && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: '#e0e7ff', color: '#4338ca' }}>schnell</span>
                      )}
                      {!item.isQuick && (
                        <span className="text-xs shrink-0" style={{ color: '#94a3b8' }}>{item.amount}{item.unit}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs" style={{ color: '#94a3b8' }}>{item.kcal} kcal</span>
                      <button onClick={() => setItems(prev => prev.filter(x => x.localId !== item.localId))}
                        className="text-base" style={{ color: '#94a3b8' }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2 px-1 text-xs font-semibold" style={{ color: '#64748b' }}>
                <span>{Math.round(totals.kcal)} kcal</span>
                <span>{Math.round(totals.protein * 10) / 10}g P</span>
                <span>CHF {totals.cost.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={handleSave} disabled={!name.trim() || items.length === 0 || saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#059669' }}>
            {saving ? 'Speichern…' : existingMeal ? 'Speichern' : 'Hinzufügen'}
          </button>
        </div>

        {/* Save-to-DB prompt for custom foods */}
        {showSavePrompt && pendingItems && (
          <div className="fixed inset-0 flex items-center justify-center z-[60] p-4"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
            <div className="w-full max-w-sm shadow-xl overflow-y-auto max-h-[80vh]"
              style={{ background: 'white', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
              <div className="px-5 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
                <h3 className="font-semibold text-sm" style={{ color: '#1e293b' }}>Neue Lebensmittel erkannt</h3>
                <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                  Sollen diese in die Datenbank aufgenommen werden?
                </p>
              </div>
              <div className="p-5 space-y-3">
                {pendingItems.filter(i => i.isCustom).map((cf, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ border: '1px solid #f1f5f9', background: '#f8fafc' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium" style={{ color: '#1e293b' }}>{cf.food_name}</span>
                      <span className="text-xs" style={{ color: '#64748b' }}>{cf.kcal} kcal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs shrink-0" style={{ color: '#64748b' }}>
                        CHF pro {cf.unit === 'stk' ? 'Stk.' : `100${cf.unit}`}:
                      </span>
                      <input type="number" min="0" step="0.01"
                        value={newFoodPrices[i] || ''}
                        onChange={e => setNewFoodPrices(prev => ({ ...prev, [i]: e.target.value }))}
                        placeholder="0.00"
                        style={{ flex: 1, background: 'white', border: '1px solid #e2e8f0', color: '#1e293b', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', fontSize: '0.875rem', outline: 'none' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 flex gap-2" style={{ borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => confirmSaveNewFoods(false)}
                  className="flex-1 py-2 text-sm rounded-lg"
                  style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>
                  Nein, nur tracken
                </button>
                <button onClick={() => confirmSaveNewFoods(true)} disabled={savingFoods}
                  className="flex-1 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40"
                  style={{ background: '#059669' }}>
                  {savingFoods ? 'Speichern…' : 'In DB speichern'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Load Vorlage Modal ─────────────────────────────────────────

interface MealTemplate {
  id: string
  name: string
  meal_type: string
  meal_template_items: {
    id: string
    amount: number
    unit: string
    foods: { id: string; name: string; calories_per_100: number; protein_per_100: number; cost_per_100: number; unit: string }
  }[]
}

function LoadVorlageModal({ menu, onClose, onSaved }: {
  menu: GrossesMenu
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<MealTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // per-template day multiplier, defaults to menu.num_days
  const [days, setDays] = useState<Record<string, number>>({})

  useEffect(() => {
    supabase
      .from('meal_templates')
      .select('*, meal_template_items(*, foods(*))')
      .order('name')
      .then(({ data }) => {
        const tpls = (data as MealTemplate[]) || []
        const defaults: Record<string, number> = {}
        tpls.forEach(t => { defaults[t.id] = menu.num_days })
        setDays(defaults)
        setTemplates(tpls)
        setLoading(false)
      })
  }, [menu.num_days])

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  function getDays(id: string) { return days[id] ?? menu.num_days }

  async function insertTemplate(tpl: MealTemplate) {
    const multiplier = getDays(tpl.id)
    if (multiplier < 1) return
    setSaving(tpl.id)
    try {
      const { data: meal } = await supabase
        .from('grosse_menu_meals')
        .insert({ menu_id: menu.id, meal_type: tpl.meal_type === 'hauptmahlzeit' ? 'mittagessen' : tpl.meal_type, name: tpl.name })
        .select()
        .single()

      if (meal && tpl.meal_template_items.length > 0) {
        await supabase.from('grosse_menu_items').insert(
          tpl.meal_template_items.map(item => {
            const n = calcNutrition(item.foods, item.amount * multiplier, item.unit)
            return {
              menu_meal_id: meal.id,
              food_id: item.foods.id,
              food_name: item.foods.name,
              amount: item.amount * multiplier,
              unit: item.unit,
              kcal: n.kcal,
              protein: n.protein,
              cost: n.cost,
            }
          })
        )
      }
      toast(`"${tpl.name}" eingefügt (×${multiplier} Tage)`, 'success')
      onSaved()
    } catch {
      toast('Fehler beim Einfügen', 'error')
      setSaving(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.75rem', padding: '0.625rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md max-h-[88vh] flex flex-col rounded-2xl shadow-xl overflow-hidden"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Vorlage einfügen</h3>
            <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
              Tage anpassen → Mengen werden automatisch hoch- oder runtergerechnet
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>

        <div className="px-5 pt-4 shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Vorlage suchen…"
            style={inputStyle}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-center text-xs py-8" style={{ color: '#94a3b8' }}>Laden…</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs py-8" style={{ color: '#94a3b8' }}>
              {search ? 'Keine Treffer' : 'Keine Vorlagen vorhanden'}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map(tpl => {
                const multiplier = getDays(tpl.id)
                const kcalPerDay = tpl.meal_template_items.reduce((s, i) =>
                  s + calcNutrition(i.foods, i.amount, i.unit).kcal, 0)
                const kcalTotal = kcalPerDay * multiplier
                return (
                  <div key={tpl.id} className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid #e2e8f0' }}>
                    {/* Header row */}
                    <div className="flex items-center gap-3 px-3.5 py-3"
                      style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#1e293b' }}>{tpl.name}</p>
                        {kcalPerDay > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                            {Math.round(kcalPerDay)} kcal/Tag
                            {multiplier > 0 && <> → <strong style={{ color: '#059669' }}>{Math.round(kcalTotal)} kcal gesamt</strong></>}
                          </p>
                        )}
                      </div>
                      {/* Days input */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setDays(d => ({ ...d, [tpl.id]: Math.max(1, (d[tpl.id] ?? menu.num_days) - 1) }))}
                          className="w-7 h-7 rounded-lg text-base font-bold flex items-center justify-center"
                          style={{ background: '#f1f5f9', color: '#475569' }}>−</button>
                        <input
                          type="number"
                          min="1" max="30"
                          value={multiplier}
                          onChange={e => setDays(d => ({ ...d, [tpl.id]: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) }))}
                          className="w-10 text-center text-sm font-bold rounded-lg outline-none"
                          style={{ border: '1px solid #e2e8f0', color: '#1e293b', padding: '0.25rem' }}
                        />
                        <button
                          onClick={() => setDays(d => ({ ...d, [tpl.id]: Math.min(30, (d[tpl.id] ?? menu.num_days) + 1) }))}
                          className="w-7 h-7 rounded-lg text-base font-bold flex items-center justify-center"
                          style={{ background: '#f1f5f9', color: '#475569' }}>+</button>
                        <span className="text-xs" style={{ color: '#94a3b8' }}>T</span>
                      </div>
                      <button
                        onClick={() => insertTemplate(tpl)}
                        disabled={saving === tpl.id || multiplier < 1}
                        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
                        style={{ background: '#059669' }}>
                        {saving === tpl.id ? '…' : 'Einfügen'}
                      </button>
                    </div>
                    {/* Items preview */}
                    {tpl.meal_template_items.length > 0 && (
                      <div className="px-3.5 py-2.5 space-y-1.5">
                        {tpl.meal_template_items.map(item => {
                          const scaled = item.amount * multiplier
                          const changed = multiplier !== 1
                          return (
                            <div key={item.id} className="flex items-center justify-between text-xs"
                              style={{ color: '#64748b' }}>
                              <span>{item.foods.name}</span>
                              <span>
                                <span style={{ color: '#94a3b8' }}>{item.amount}{item.unit}/Tag</span>
                                <span style={{ color: '#94a3b8' }}> × {multiplier} = </span>
                                <strong style={{ color: changed ? '#059669' : '#475569' }}>
                                  {Number.isInteger(scaled) ? scaled : Math.round(scaled * 10) / 10}{item.unit}
                                </strong>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}>Schließen</button>
        </div>
      </div>
    </div>
  )
}

// ── Distribute Modal ───────────────────────────────────────────

function DistributeModal({ menu, onClose, onDistributed }: {
  menu: GrossesMenu
  onClose: () => void
  onDistributed: () => void
}) {
  const { toast } = useToast()
  const [startDate, setStartDate] = useState(toDateStr(new Date()))
  const [distributing, setDistributing] = useState(false)

  function getPreviewDates(): string[] {
    const dates: string[] = []
    const start = new Date(startDate + 'T12:00:00')
    for (let i = 0; i < menu.num_days; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      dates.push(toDateStr(d))
    }
    return dates
  }

  async function distribute() {
    setDistributing(true)
    try {
      const dates = getPreviewDates()
      for (const dateStr of dates) {
        let planId: string
        const { data: existing } = await supabase
          .from('meal_plans')
          .select('id')
          .eq('date', dateStr)
          .maybeSingle()

        if (existing) {
          planId = existing.id
        } else {
          const { data: created } = await supabase
            .from('meal_plans')
            .insert({ date: dateStr, kcal_total: 0, protein_total: 0, cost_total: 0 })
            .select()
            .single()
          planId = created!.id
        }

        for (const menuMeal of menu.grosse_menu_meals) {
          const items = menuMeal.grosse_menu_items || []
          const { data: newMeal } = await supabase
            .from('meals')
            .insert({
              plan_id: planId,
              meal_type: menuMeal.meal_type,
              name: menuMeal.name,
              kcal_total: Math.round(items.reduce((s, i) => s + i.kcal, 0) / menu.num_days * 10) / 10,
              protein_total: Math.round(items.reduce((s, i) => s + i.protein, 0) / menu.num_days * 10) / 10,
              cost_total: Math.round(items.reduce((s, i) => s + i.cost, 0) / menu.num_days * 1000) / 1000,
            })
            .select()
            .single()

          if (newMeal && items.length > 0) {
            await supabase.from('meal_items').insert(
              items.map(item => ({
                meal_id: newMeal.id,
                food_id: item.food_id,
                food_name: item.food_name,
                amount: Math.round(item.amount / menu.num_days * 100) / 100,
                unit: item.unit,
                kcal: Math.round(item.kcal / menu.num_days * 10) / 10,
                protein: Math.round(item.protein / menu.num_days * 10) / 10,
                cost: Math.round(item.cost / menu.num_days * 1000) / 1000,
              }))
            )
          }
        }

        // Recalc plan totals
        const { data: allMeals } = await supabase
          .from('meals')
          .select('kcal_total,protein_total,cost_total')
          .eq('plan_id', planId)
        const t = (allMeals || []).reduce(
          (acc, m) => ({
            kcal: acc.kcal + Number(m.kcal_total),
            protein: acc.protein + Number(m.protein_total),
            cost: acc.cost + Number(m.cost_total),
          }),
          { kcal: 0, protein: 0, cost: 0 }
        )
        await supabase
          .from('meal_plans')
          .update({ kcal_total: t.kcal, protein_total: t.protein, cost_total: t.cost })
          .eq('id', planId)
      }

      toast(`"${menu.name}" auf ${menu.num_days} Tage verteilt`, 'success')
      onDistributed()
    } catch {
      toast('Fehler beim Verteilen', 'error')
      setDistributing(false)
    }
  }

  const previewDates = getPreviewDates()

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h3 className="text-sm font-bold" style={{ color: '#1e293b' }}>Menü verteilen</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-sm font-bold" style={{ color: '#166534' }}>{menu.name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
              {menu.num_days} Tage · {menu.grosse_menu_meals.length} Mahlzeit{menu.grosse_menu_meals.length !== 1 ? 'en' : ''}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Startdatum</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
          </div>

          <div>
            <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>
              Wird verteilt auf {previewDates.length} Tage
            </p>
            <div className="space-y-1.5">
              {previewDates.map((d, i) => {
                const dateObj = new Date(d + 'T12:00:00')
                return (
                  <div key={d} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                    <span className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shrink-0"
                      style={{ background: '#eef2ff', color: '#4f46e5' }}>
                      {i + 1}
                    </span>
                    <span className="text-xs" style={{ color: '#475569' }}>
                      {DAY_SHORT[dateObj.getDay()]}, {dateObj.getDate()}. {MONTH_SHORT[dateObj.getMonth()]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
          <button onClick={distribute} disabled={!startDate || distributing}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#059669' }}>
            {distributing ? 'Verteilen…' : 'Verteilen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────

export default function GrosseMenusPage() {
  const { toast } = useToast()
  const [menus, setMenus] = useState<GrossesMenu[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDays, setNewDays] = useState(3)
  const [addingMealTo, setAddingMealTo] = useState<string | null>(null)
  const [editingMeal, setEditingMeal] = useState<GrossesMenuMahlzeit | null>(null)
  const [loadingVorlageTo, setLoadingVorlageTo] = useState<GrossesMenu | null>(null)
  const [distributeMenu, setDistributeMenu] = useState<GrossesMenu | null>(null)
  const [distStats, setDistStats] = useState<Record<string, { thisWeek: number; nextWeek: number }>>({})

  useEffect(() => { loadMenus() }, [])

  async function loadDistStats() {
    const today = new Date()
    const monday = getMondayOfWeek(today)
    const thisWeekStart = toDateStr(monday)
    const thisWeekEnd = toDateStr(new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000))
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000)
    const nextWeekEnd = toDateStr(new Date(nextMonday.getTime() + 6 * 24 * 60 * 60 * 1000))
    const { data } = await supabase
      .from('menu_distribution_log')
      .select('menu_id, date')
      .gte('date', thisWeekStart)
      .lte('date', nextWeekEnd)
    if (!data) return
    const stats: Record<string, { thisWeek: number; nextWeek: number }> = {}
    for (const row of data) {
      if (!stats[row.menu_id]) stats[row.menu_id] = { thisWeek: 0, nextWeek: 0 }
      if (row.date <= thisWeekEnd) stats[row.menu_id].thisWeek++
      else stats[row.menu_id].nextWeek++
    }
    setDistStats(stats)
  }

  async function loadMenus() {
    setLoading(true)
    const [menuRes] = await Promise.all([
      supabase.from('grosse_menus').select('*, grosse_menu_meals(*, grosse_menu_items(*))').order('created_at', { ascending: false }),
      loadDistStats(),
    ])
    setMenus((menuRes.data as GrossesMenu[]) || [])
    setLoading(false)
  }

  async function createMenu() {
    if (!newName.trim()) return
    const { data } = await supabase
      .from('grosse_menus')
      .insert({ name: newName.trim(), num_days: newDays })
      .select()
      .single()
    if (data) {
      setNewName('')
      setNewDays(3)
      setCreating(false)
      setExpandedId(data.id)
      await loadMenus()
      toast(`"${data.name}" erstellt`, 'success')
    }
  }

  async function deleteMenu(menu: GrossesMenu) {
    if (!confirm(`"${menu.name}" wirklich löschen?`)) return
    await supabase.from('grosse_menus').delete().eq('id', menu.id)
    await loadMenus()
    toast(`"${menu.name}" gelöscht`, 'success')
  }

  async function deleteMeal(meal: GrossesMenuMahlzeit, menuName: string) {
    await supabase.from('grosse_menu_meals').delete().eq('id', meal.id)
    await loadMenus()
    toast(`"${meal.name}" entfernt`, 'success')
  }

  if (loading) {
    return <div className="text-center py-12 text-sm" style={{ color: '#94a3b8' }}>Laden…</div>
  }

  return (
    <div className="max-w-xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#1e293b' }}>Große Menüs</h1>
          <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
            Kochmengen für mehrere Tage planen und gleichmäßig verteilen
          </p>
        </div>
        <button onClick={() => setCreating(true)}
          className="text-xs font-bold px-4 py-2 rounded-xl text-white"
          style={{ background: '#059669' }}>
          + Neu
        </button>
      </div>

      {/* Info card */}
      <div className="rounded-2xl p-4 mb-5 flex items-start gap-3"
        style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
        <span className="text-lg mt-0.5">💡</span>
        <p className="text-xs leading-relaxed" style={{ color: '#166534' }}>
          Erstelle ein Menü mit den Gesamtmengen (z.B. 900 g Pasta für 3 Tage). 
          Beim Verteilen rechnet die App automatisch die Tagesportion aus und 
          trägt sie in die gewählten Tage ein.
        </p>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-2xl p-5 mb-5"
          style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: '#1e293b' }}>Neues Menü</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name</label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createMenu()}
                placeholder="z.B. Pasta Bolognese Batch"
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>
                Für wie viele Tage kochst du?
              </label>
              <div className="flex items-center gap-3">
                <input type="number" value={newDays}
                  onChange={e => setNewDays(Math.max(1, Math.min(14, parseInt(e.target.value) || 1)))}
                  min="1" max="14"
                  className="w-20 px-3 py-2.5 rounded-xl text-sm outline-none text-center font-bold"
                  style={{ border: '1px solid #e2e8f0', color: '#1e293b' }} />
                <span className="text-sm" style={{ color: '#64748b' }}>Tage</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setCreating(false); setNewName('') }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
            <button onClick={createMenu} disabled={!newName.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
              style={{ background: '#059669' }}>Erstellen</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {menus.length === 0 && !creating && (
        <div className="text-center py-14 rounded-2xl"
          style={{ background: 'white', border: '1px dashed #e2e8f0' }}>
          <p className="text-3xl mb-3">🍲</p>
          <p className="text-sm font-semibold" style={{ color: '#475569' }}>Noch keine großen Menüs</p>
          <p className="text-xs mt-1 mb-5" style={{ color: '#94a3b8' }}>
            Erstelle ein Menü für mehrere Tage Meal Prep
          </p>
          <button onClick={() => setCreating(true)}
            className="text-sm font-bold px-6 py-2.5 rounded-xl text-white"
            style={{ background: '#059669' }}>
            Erstes Menü erstellen
          </button>
        </div>
      )}

      {/* Menu list */}
      <div className="space-y-4">
        {menus.map(menu => {
          const isExpanded = expandedId === menu.id
          const allItems = menu.grosse_menu_meals.flatMap(m => m.grosse_menu_items)
          const totalKcal = allItems.reduce((s, i) => s + Number(i.kcal), 0)
          const totalProtein = allItems.reduce((s, i) => s + Number(i.protein), 0)
          const perDayKcal = menu.num_days > 0 ? Math.round(totalKcal / menu.num_days) : 0
          const perDayProtein = menu.num_days > 0 ? Math.round(totalProtein / menu.num_days * 10) / 10 : 0

          return (
            <div key={menu.id} className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

              {/* Menu header */}
              <button
                className="w-full px-5 py-4 flex items-center justify-between text-left"
                style={{ background: '#f8fafc', borderBottom: isExpanded ? '1px solid #f1f5f9' : 'none' }}
                onClick={() => setExpandedId(isExpanded ? null : menu.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{menu.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                      style={{ background: '#f0fdf4', color: '#166534' }}>
                      {menu.num_days} Tage
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                    {menu.grosse_menu_meals.length} Mahlzeit{menu.grosse_menu_meals.length !== 1 ? 'en' : ''}
                    {perDayKcal > 0 ? ` · ≈ ${perDayKcal} kcal/Tag · ${perDayProtein}g P/Tag` : ' · Noch keine Zutaten'}
                  </p>
                  {(distStats[menu.id]?.thisWeek > 0 || distStats[menu.id]?.nextWeek > 0) && (
                    <p className="text-xs mt-1 font-semibold" style={{ color: '#059669' }}>
                      {distStats[menu.id].thisWeek > 0 ? `${distStats[menu.id].thisWeek}× diese Woche` : ''}
                      {distStats[menu.id].thisWeek > 0 && distStats[menu.id].nextWeek > 0 ? ' · ' : ''}
                      {distStats[menu.id].nextWeek > 0 ? `${distStats[menu.id].nextWeek}× nächste Woche` : ''}
                    </p>
                  )}
                </div>
                <span className="ml-3 shrink-0 text-lg" style={{
                  color: '#94a3b8',
                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                }}>▾</span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div>
                  {menu.grosse_menu_meals.length === 0 ? (
                    <div className="px-5 py-8 text-center">
                      <p className="text-xs" style={{ color: '#94a3b8' }}>
                        Noch keine Mahlzeiten – füge deine erste Mahlzeit hinzu
                      </p>
                    </div>
                  ) : (
                    <div>
                      {menu.grosse_menu_meals.map((meal, mealIdx) => {
                        const mealKcal = meal.grosse_menu_items.reduce((s, i) => s + Number(i.kcal), 0)
                        const mealProtein = meal.grosse_menu_items.reduce((s, i) => s + Number(i.protein), 0)
                        const mealCost = meal.grosse_menu_items.reduce((s, i) => s + Number(i.cost), 0)
                        return (
                          <div key={meal.id} className="px-5 py-4"
                            style={mealIdx > 0 ? { borderTop: '1px solid #f8fafc' } : {}}>
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <span className="text-xs font-semibold uppercase tracking-wider"
                                  style={{ color: '#94a3b8' }}>
                                  {MEAL_TYPE_LABELS[meal.meal_type]}
                                </span>
                                <p className="text-sm font-bold mt-0.5" style={{ color: '#1e293b' }}>
                                  {meal.name}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 ml-3 shrink-0">
                                <button onClick={() => setEditingMeal(meal)}
                                  className="text-xs" style={{ color: '#475569' }}>
                                  Bearbeiten
                                </button>
                                <button onClick={() => deleteMeal(meal, menu.name)}
                                  className="text-xs" style={{ color: '#94a3b8' }}>
                                  Entfernen
                                </button>
                              </div>
                            </div>

                            {meal.grosse_menu_items.length > 0 && (
                              <div className="space-y-1 mb-3">
                                {meal.grosse_menu_items.map(item => (
                                  <div key={item.id} className="flex items-center justify-between text-xs"
                                    style={{ color: '#64748b' }}>
                                    <span>{item.food_name}</span>
                                    <span style={{ color: '#94a3b8' }}>
                                      {item.amount}{item.unit} · {item.kcal} kcal
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-2"
                              style={{ borderTop: '1px solid #f8fafc' }}>
                              <div className="flex gap-3 text-xs" style={{ color: '#64748b' }}>
                                <span className="font-bold">{Math.round(mealKcal)} kcal gesamt</span>
                                <span>{Math.round(mealProtein * 10) / 10}g P</span>
                                <span>CHF {mealCost.toFixed(2)}</span>
                              </div>
                              <span className="text-xs px-2 py-0.5 rounded-md"
                                style={{ background: '#eef2ff', color: '#4f46e5' }}>
                                → {Math.round(mealKcal / menu.num_days)} kcal/Tag
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="px-5 py-4 flex gap-2 flex-wrap" style={{ borderTop: '1px solid #f1f5f9' }}>
                    <button onClick={() => setLoadingVorlageTo(menu)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                      style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
                      Vorlage einfügen
                    </button>
                    <button onClick={() => setAddingMealTo(menu.id)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                      style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}>
                      + Manuell
                    </button>
                    <button
                      onClick={() => setDistributeMenu(menu)}
                      disabled={menu.grosse_menu_meals.length === 0}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                      style={{ background: '#059669' }}>
                      Verteilen
                    </button>
                    <button onClick={() => deleteMenu(menu)}
                      className="py-2.5 px-3 rounded-xl text-xs"
                      style={{ background: '#fff1f2', color: '#dc2626', border: '1px solid #fecdd3' }}>
                      Löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modals */}
      {(addingMealTo || editingMeal) && (
        <AddMealModal
          menuId={addingMealTo || editingMeal!.menu_id}
          existingMeal={editingMeal}
          onClose={() => { setAddingMealTo(null); setEditingMeal(null) }}
          onSaved={async () => {
            const wasEditing = !!editingMeal
            setAddingMealTo(null)
            setEditingMeal(null)
            await loadMenus()
            toast(wasEditing ? 'Mahlzeit aktualisiert' : 'Mahlzeit hinzugefügt', 'success')
          }}
        />
      )}

      {distributeMenu && (
        <DistributeModal
          menu={distributeMenu}
          onClose={() => setDistributeMenu(null)}
          onDistributed={() => setDistributeMenu(null)}
        />
      )}

      {loadingVorlageTo && (
        <LoadVorlageModal
          menu={loadingVorlageTo}
          onClose={() => setLoadingVorlageTo(null)}
          onSaved={async () => {
            setLoadingVorlageTo(null)
            await loadMenus()
          }}
        />
      )}
    </div>
  )
}
