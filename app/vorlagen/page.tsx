'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { calcNutrition, sumItems } from '@/lib/calculations'

const MEAL_TYPE_LABELS: Record<string, string> = {
  fruehstueck:   'Frühstück',
  hauptmahlzeit: 'Hauptmahlzeit',
  snack:         'Snack',
  // legacy values (displayed grouped under Hauptmahlzeit)
  mittagessen:   'Hauptmahlzeit',
  abendessen:    'Hauptmahlzeit',
}
const MEAL_TYPE_ORDER = ['fruehstueck', 'hauptmahlzeit', 'snack']

interface Food {
  id: string; name: string; calories_per_100: number; protein_per_100: number; cost_per_100: number; unit: 'g' | 'ml' | 'stk'
}

interface TemplateItem {
  id: string
  amount: number
  unit: string
  foods: Food
}

interface Template {
  id: string
  name: string
  meal_type: string
  meal_template_items: TemplateItem[]
}

interface EditItem {
  localId: string
  food_id: string; food_name: string; amount: number; unit: string
}

// ── Template Edit Modal ───────────────────────────────────────
function TemplateEditModal({ template, onClose, onSaved }: {
  template: Template; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(template.name)
  const [items, setItems] = useState<EditItem[]>(
    template.meal_template_items.map(ti => ({
      localId: ti.id,
      food_id: ti.foods.id,
      food_name: ti.foods.name,
      amount: ti.amount,
      unit: ti.unit,
    }))
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Food[]>([])
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const [saving, setSaving] = useState(false)
  const [editingLocalId, setEditingLocalId]       = useState<string | null>(null)
  const [editingAmt, setEditingAmt] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)

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

  function selectFood(food: Food) {
    setSelectedFood(food); setSearchQuery(food.name); setSearchResults([])
    setUnit(food.unit === 'ml' ? 'ml' : food.unit === 'stk' ? 'stk' : 'g'); setAmount('')
  }

  function addItem() {
    if (!selectedFood || !amount) return
    setItems(prev => [...prev, {
      localId: Math.random().toString(36).slice(2),
      food_id: selectedFood.id, food_name: selectedFood.name, amount: parseFloat(amount), unit,
    }])
    setSelectedFood(null); setSearchQuery(''); setAmount('')
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    await supabase.from('meal_templates').update({ name: name.trim() }).eq('id', template.id)
    await supabase.from('meal_template_items').delete().eq('template_id', template.id)
    if (items.length > 0) {
      await supabase.from('meal_template_items').insert(
        items.map(item => ({ template_id: template.id, food_id: item.food_id, amount: item.amount, unit: item.unit }))
      )
    }
    setSaving(false); onSaved()
  }

  const inputStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  }
  const selectStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.5rem', padding: '0.5rem 0.5rem', fontSize: '0.875rem', outline: 'none',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <h2 className="font-semibold text-sm" style={{ color: '#1e293b' }}>Vorlage bearbeiten</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </div>
          <div className="text-xs" style={{ color: '#94a3b8' }}>
            Typ: <span style={{ color: '#64748b', fontWeight: 600 }}>{MEAL_TYPE_LABELS[template.meal_type]}</span>
          </div>
          <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <p className="text-xs font-medium" style={{ color: '#64748b' }}>Zutat hinzufügen</p>
            <div className="relative" ref={searchRef}>
              <input type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSelectedFood(null) }}
                placeholder="Lebensmittel suchen…" style={inputStyle} />
              {searchResults.length > 0 && (
                <ul className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg shadow-xl max-h-44 overflow-y-auto"
                  style={{ background: 'white', border: '1px solid #e2e8f0' }}>
                  {searchResults.map(food => (
                    <li key={food.id} onMouseDown={() => selectFood(food)} className="px-3 py-2 text-sm cursor-pointer" style={{ color: '#1e293b' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f1f5f9')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                      <span className="font-medium">{food.name}</span>
                      <span className="text-xs ml-2" style={{ color: '#64748b' }}>{food.calories_per_100} kcal</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2">
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Menge" min="0" step="1" style={{ ...inputStyle, width: undefined, flex: 1 }} />
              <select value={unit} onChange={e => setUnit(e.target.value)} style={selectStyle}>
                {selectedFood?.unit === 'ml' ? (
                  <><option value="ml">ml</option><option value="dl">dl</option><option value="l">l</option></>
                ) : selectedFood?.unit === 'stk' ? (
                  <option value="stk">Stk.</option>
                ) : <option value="g">g</option>}
              </select>
              <button onClick={addItem} disabled={!selectedFood || !amount}
                className="text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: '#475569' }}>+</button>
            </div>
          </div>
          {items.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>Zutaten ({items.length})</p>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #f1f5f9' }}>
                {items.map((item, i) => (
                  <div key={item.localId} className="flex items-center justify-between px-3 py-2.5"
                    style={i > 0 ? { borderTop: '1px solid #f1f5f9' } : {}}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: '#1e293b' }}>{item.food_name}</span>
                      {editingLocalId === item.localId ? (
                        <input
                          autoFocus
                          type="number"
                          min="0.1"
                          step="any"
                          value={editingAmt}
                          onChange={e => setEditingAmt(e.target.value)}
                          onBlur={() => {
                            const v = parseFloat(editingAmt)
                            if (v > 0) setItems(prev => prev.map(x => x.localId === item.localId ? { ...x, amount: v } : x))
                            setEditingLocalId(null)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const v = parseFloat(editingAmt)
                              if (v > 0) setItems(prev => prev.map(x => x.localId === item.localId ? { ...x, amount: v } : x))
                              setEditingLocalId(null)
                            }
                            if (e.key === 'Escape') setEditingLocalId(null)
                          }}
                          className="w-16 text-xs rounded px-1 py-0.5"
                          style={{ border: '1px solid #c7d2fe', color: '#4f46e5', background: '#eef2ff', outline: 'none' }}
                        />
                      ) : (
                        <span
                          className="text-xs shrink-0 cursor-pointer rounded px-1 py-0.5 transition-colors"
                          style={{ color: '#64748b' }}
                          title="Menge bearbeiten"
                          onClick={() => { setEditingLocalId(item.localId); setEditingAmt(String(item.amount)) }}
                        >{item.amount}{item.unit}</span>
                      )}
                    </div>
                    <button onClick={() => setItems(prev => prev.filter(x => x.localId !== item.localId))}
                      className="text-base leading-none ml-3 transition-colors" style={{ color: '#94a3b8' }}
                      onMouseEnter={e => ((e.target as HTMLElement).style.color = '#f87171')}
                      onMouseLeave={e => ((e.target as HTMLElement).style.color = '#94a3b8')}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg"
            style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>Abbrechen</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40"
            style={{ background: '#475569' }}>{saving ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Template Create Modal ─────────────────────────────────────
function TemplateCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [mealType, setMealType] = useState('mittagessen')
  const [items, setItems] = useState<EditItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Food[]>([])
  const [selectedFood, setSelectedFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('g')
  const [saving, setSaving] = useState(false)
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null)
  const [editingAmt, setEditingAmt] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)

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

  function selectFood(food: Food) {
    setSelectedFood(food); setSearchQuery(food.name); setSearchResults([])
    setUnit(food.unit === 'ml' ? 'ml' : food.unit === 'stk' ? 'stk' : 'g'); setAmount('')
  }

  function addItem() {
    if (!selectedFood || !amount) return
    setItems(prev => [...prev, {
      localId: Math.random().toString(36).slice(2),
      food_id: selectedFood.id, food_name: selectedFood.name, amount: parseFloat(amount), unit,
    }])
    setSelectedFood(null); setSearchQuery(''); setAmount('')
  }

  async function save() {
    if (!name.trim() || items.length === 0) return
    setSaving(true)
    const { data: tmpl } = await supabase.from('meal_templates').insert({ name: name.trim(), meal_type: mealType }).select().single()
    if (tmpl) {
      await supabase.from('meal_template_items').insert(
        items.map(item => ({ template_id: tmpl.id, food_id: item.food_id, amount: item.amount, unit: item.unit }))
      )
    }
    setSaving(false); onSaved()
  }

  const inputStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  }
  const selectStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.5rem', padding: '0.5rem 0.5rem', fontSize: '0.875rem', outline: 'none',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <h2 className="font-semibold text-sm" style={{ color: '#1e293b' }}>Neue Vorlage erstellen</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Porridge mit Beeren" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Typ</label>
            <select value={mealType} onChange={e => setMealType(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
              <option value="fruehstueck">Frühstück</option>
              <option value="hauptmahlzeit">Hauptmahlzeit</option>
              <option value="snack">Snack</option>
            </select>
          </div>
          <div className="rounded-lg p-4 space-y-3" style={{ border: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <p className="text-xs font-medium" style={{ color: '#64748b' }}>Zutat hinzufügen</p>
            <div className="relative" ref={searchRef}>
              <input type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSelectedFood(null) }}
                placeholder="Lebensmittel suchen…" style={inputStyle} />
              {searchResults.length > 0 && (
                <ul className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg shadow-xl max-h-44 overflow-y-auto"
                  style={{ background: 'white', border: '1px solid #e2e8f0' }}>
                  {searchResults.map(food => (
                    <li key={food.id} onMouseDown={() => selectFood(food)} className="px-3 py-2 text-sm cursor-pointer" style={{ color: '#1e293b' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = '#f1f5f9')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                      <span className="font-medium">{food.name}</span>
                      <span className="text-xs ml-2" style={{ color: '#64748b' }}>{food.calories_per_100} kcal</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2">
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="Menge" min="0" step="1" style={{ ...inputStyle, width: undefined, flex: 1 }} />
              <select value={unit} onChange={e => setUnit(e.target.value)} style={selectStyle}>
                {selectedFood?.unit === 'ml' ? (
                  <><option value="ml">ml</option><option value="dl">dl</option><option value="l">l</option></>
                ) : selectedFood?.unit === 'stk' ? (
                  <option value="stk">Stk.</option>
                ) : <option value="g">g</option>}
              </select>
              <button onClick={addItem} disabled={!selectedFood || !amount}
                className="text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: '#475569' }}>+</button>
            </div>
          </div>
          {items.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: '#64748b' }}>Zutaten ({items.length})</p>
              <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #f1f5f9' }}>
                {items.map((item, i) => (
                  <div key={item.localId} className="flex items-center justify-between px-3 py-2.5"
                    style={i > 0 ? { borderTop: '1px solid #f1f5f9' } : {}}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: '#1e293b' }}>{item.food_name}</span>
                      {editingLocalId === item.localId ? (
                        <input autoFocus type="number" min="0.1" step="any" value={editingAmt}
                          onChange={e => setEditingAmt(e.target.value)}
                          onBlur={() => { const v = parseFloat(editingAmt); if (v > 0) setItems(prev => prev.map(x => x.localId === item.localId ? { ...x, amount: v } : x)); setEditingLocalId(null) }}
                          onKeyDown={e => { if (e.key === 'Enter') { const v = parseFloat(editingAmt); if (v > 0) setItems(prev => prev.map(x => x.localId === item.localId ? { ...x, amount: v } : x)); setEditingLocalId(null) } if (e.key === 'Escape') setEditingLocalId(null) }}
                          className="w-16 text-xs rounded px-1 py-0.5"
                          style={{ border: '1px solid #c7d2fe', color: '#4f46e5', background: '#eef2ff', outline: 'none' }} />
                      ) : (
                        <span className="text-xs shrink-0 cursor-pointer rounded px-1 py-0.5" style={{ color: '#64748b' }}
                          title="Menge bearbeiten"
                          onClick={() => { setEditingLocalId(item.localId); setEditingAmt(String(item.amount)) }}>{item.amount}{item.unit}</span>
                      )}
                    </div>
                    <button onClick={() => setItems(prev => prev.filter(x => x.localId !== item.localId))}
                      className="text-base leading-none ml-3 transition-colors" style={{ color: '#94a3b8' }}
                      onMouseEnter={e => ((e.target as HTMLElement).style.color = '#f87171')}
                      onMouseLeave={e => ((e.target as HTMLElement).style.color = '#94a3b8')}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg"
            style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>Abbrechen</button>
          <button onClick={save} disabled={!name.trim() || items.length === 0 || saving}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40"
            style={{ background: '#475569' }}>{saving ? 'Speichern…' : 'Erstellen'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Template Duplicate Modal ──────────────────────────────────
function TemplateDuplicateModal({ template, onClose, onSaved }: {
  template: Template; onClose: () => void; onSaved: () => void
}) {
  const dupeType = (template.meal_type === 'mittagessen' || template.meal_type === 'abendessen') ? 'hauptmahlzeit' : template.meal_type
  const [name, setName] = useState(template.name + ' (Kopie)')
  const [mealType, setMealType] = useState(dupeType)
  const [saving, setSaving] = useState(false)

  const inputStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  }
  const selectStyle: React.CSSProperties = {
    background: 'white', border: '1px solid #e2e8f0', color: '#1e293b',
    borderRadius: '0.5rem', padding: '0.5rem 0.5rem', fontSize: '0.875rem', outline: 'none', width: '100%',
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data: tmpl } = await supabase
      .from('meal_templates')
      .insert({ name: name.trim(), meal_type: mealType })
      .select()
      .single()
    if (tmpl && template.meal_template_items.length > 0) {
      await supabase.from('meal_template_items').insert(
        template.meal_template_items.map(ti => ({
          template_id: tmpl.id,
          food_id: ti.foods.id,
          amount: ti.amount,
          unit: ti.unit,
        }))
      )
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm shadow-xl"
        style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
          <h2 className="font-semibold text-sm" style={{ color: '#1e293b' }}>Vorlage duplizieren</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
            style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name der Kopie</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Mahlzeit-Typ</label>
            <select value={mealType} onChange={e => setMealType(e.target.value)} style={selectStyle}>
              <option value="fruehstueck">Frühstück</option>
              <option value="hauptmahlzeit">Hauptmahlzeit</option>
              <option value="snack">Snack</option>
            </select>
          </div>
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            Alle {template.meal_template_items.length} Zutaten werden übernommen.
          </p>
        </div>
        <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg"
            style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>Abbrechen</button>
          <button onClick={save} disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40"
            style={{ background: '#475569' }}>{saving ? 'Duplizieren…' : 'Duplizieren'}</button>
        </div>
      </div>
    </div>
  )
}

interface PlanTemplate {
  id: string; name: string; type: 'day' | 'week'; created_at: string
  plan_template_days: {
    id: string; day_offset: number
    plan_template_meals: {
      id: string; meal_type: string; name: string
      plan_template_items: { id: string; food_name: string; amount: number; unit: string; kcal: number; protein: number; cost: number }[]
    }[]
  }[]
}

export default function VorlagenPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [planTemplates, setPlanTemplates] = useState<PlanTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [duplicatingTemplate, setDuplicatingTemplate] = useState<Template | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [activeTab, setActiveTab] = useState<'meal' | 'day' | 'week'>('meal')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [mealRes, planRes] = await Promise.all([
      supabase.from('meal_templates').select('*, meal_template_items(*, foods(*))').order('name'),
      supabase.from('plan_templates').select('*, plan_template_days(*, plan_template_meals(*, plan_template_items(*)))').order('created_at', { ascending: false }),
    ])
    setTemplates((mealRes.data as Template[]) || [])
    setPlanTemplates((planRes.data as PlanTemplate[]) || [])
    setLoading(false)
  }

  async function remove(id: string) {
    if (!confirm('Vorlage wirklich löschen?')) return
    await supabase.from('meal_templates').delete().eq('id', id)
    await load()
  }

  async function removePlanTemplate(id: string) {
    if (!confirm('Vorlage wirklich löschen?')) return
    await supabase.from('plan_templates').delete().eq('id', id)
    await load()
  }

  const grouped = MEAL_TYPE_ORDER.reduce<Record<string, Template[]>>((acc, type) => {
    if (type === 'hauptmahlzeit') {
      acc[type] = templates.filter(t => t.meal_type === 'hauptmahlzeit' || t.meal_type === 'mittagessen' || t.meal_type === 'abendessen')
    } else {
      acc[type] = templates.filter(t => t.meal_type === type)
    }
    return acc
  }, {})

  const dayPlanTemplates = planTemplates.filter(t => t.type === 'day')
  const weekPlanTemplates = planTemplates.filter(t => t.type === 'week')

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: '#1e293b' }}>Vorlagen</h1>
          <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>Mahlzeiten-, Tages- und Wochenvorlagen verwalten.</p>
        </div>
        {activeTab === 'meal' && (
          <button onClick={() => setCreatingTemplate(true)}
            className="text-xs text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition-opacity"
            style={{ background: '#475569' }}>
            + Neue Vorlage
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 p-1 rounded-xl mb-5" style={{ background: '#f1f5f9' }}>
        {([
          { key: 'meal' as const, label: 'Mahlzeiten', count: templates.length },
          { key: 'day' as const, label: 'Tagespläne', count: dayPlanTemplates.length },
          { key: 'week' as const, label: 'Wochenpläne', count: weekPlanTemplates.length },
        ]).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="flex-1 py-2 text-xs rounded-lg font-semibold transition-all"
            style={activeTab === tab.key ? { background: 'white', color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: '#94a3b8' }}>
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-10 text-sm" style={{ color: '#64748b' }}>Laden…</div>}

      {/* Meal templates tab */}
      {!loading && activeTab === 'meal' && (
        <>
          {templates.length === 0 && (
            <div className="p-10 text-center text-sm rounded-2xl"
              style={{ background: 'white', border: '1px solid #f1f5f9', color: '#94a3b8', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              Noch keine Mahlzeit-Vorlagen vorhanden.<br />
              <span className="text-xs">Beim Hinzufügen einer Mahlzeit kannst du sie als Vorlage speichern.</span>
            </div>
          )}

          {MEAL_TYPE_ORDER.map(type => {
        const list = grouped[type]
        if (!list.length) return null
        return (
          <div key={type} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>
              {MEAL_TYPE_LABELS[type]}
            </h2>
            <div className="space-y-3">
              {list.map(template => {
                const items = template.meal_template_items || []
                const totals = sumItems(
                  items.map(ti => calcNutrition(ti.foods, ti.amount, ti.unit))
                )
                return (
                  <div
                    key={template.id}
                    className="p-5 rounded-2xl"
                    style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="font-semibold text-sm" style={{ color: '#1e293b' }}>{template.name}</span>
                      <div className="flex gap-3 ml-4">
                        <button
                          onClick={() => setEditingTemplate(template)}
                          className="text-xs transition-colors"
                          style={{ color: '#475569' }}
                          onMouseEnter={e => ((e.target as HTMLElement).style.color = '#1e293b')}
                          onMouseLeave={e => ((e.target as HTMLElement).style.color = '#475569')}
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => setDuplicatingTemplate(template)}
                          className="text-xs transition-colors"
                          style={{ color: '#0891b2' }}
                          onMouseEnter={e => ((e.target as HTMLElement).style.color = '#0e7490')}
                          onMouseLeave={e => ((e.target as HTMLElement).style.color = '#0891b2')}
                        >
                          Duplizieren
                        </button>
                        <button
                          onClick={() => remove(template.id)}
                          className="text-xs transition-colors"
                          style={{ color: '#dc2626' }}
                          onMouseEnter={e => ((e.target as HTMLElement).style.color = '#b91c1c')}
                          onMouseLeave={e => ((e.target as HTMLElement).style.color = '#dc2626')}
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                    {/* Items */}
                    <div className="space-y-1 mb-3">
                      {items.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span style={{ color: '#94a3b8' }}>
                            {item.foods?.name}
                            <span className="ml-1.5" style={{ color: '#64748b' }}>{item.amount}{item.unit}</span>
                          </span>
                          <div className="flex gap-3" style={{ color: '#64748b' }}>
                            <span>{calcNutrition(item.foods, item.amount, item.unit).kcal} kcal</span>
                            <span>{calcNutrition(item.foods, item.amount, item.unit).protein}g P</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Totals */}
                    {items.length > 0 && (
                      <div
                        className="pt-2.5 flex gap-4 text-xs font-medium"
                        style={{ borderTop: '1px solid #f1f5f9', color: '#64748b' }}
                      >
                        <span>{Math.round(totals.kcal)} kcal</span>
                        <span>{totals.protein}g Protein</span>
                        <span>CHF {totals.cost.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
        </>
      )}

      {/* Day plan templates tab */}
      {!loading && activeTab === 'day' && (
        <>
          {dayPlanTemplates.length === 0 ? (
            <div className="p-10 text-center text-sm rounded-2xl"
              style={{ background: 'white', border: '1px solid #f1f5f9', color: '#94a3b8', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              Noch keine Tagesplan-Vorlagen vorhanden.<br />
              <span className="text-xs">Markiere einen Tag im Kalender als fertig und speichere ihn als Vorlage.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {dayPlanTemplates.map(tmpl => {
                const allMeals = tmpl.plan_template_days.flatMap(d => d.plan_template_meals || [])
                const allItems = allMeals.flatMap(m => m.plan_template_items || [])
                const totalKcal = allItems.reduce((s, i) => s + Number(i.kcal), 0)
                const totalProtein = allItems.reduce((s, i) => s + Number(i.protein), 0)
                const totalCost = allItems.reduce((s, i) => s + Number(i.cost), 0)
                return (
                  <div key={tmpl.id} className="p-5 rounded-2xl"
                    style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="font-semibold text-sm" style={{ color: '#1e293b' }}>{tmpl.name}</span>
                        <span className="text-xs ml-2 px-2 py-0.5 rounded-full" style={{ background: '#eef2ff', color: '#4f46e5' }}>Tagesplan</span>
                      </div>
                      <button onClick={() => removePlanTemplate(tmpl.id)}
                        className="text-xs transition-colors" style={{ color: '#dc2626' }}>Löschen</button>
                    </div>
                    <div className="space-y-1 mb-3">
                      {allMeals.map(meal => (
                        <div key={meal.id} className="text-xs" style={{ color: '#64748b' }}>
                          <span className="font-medium" style={{ color: '#475569' }}>{MEAL_TYPE_LABELS[meal.meal_type] || meal.meal_type}:</span>{' '}
                          {meal.name}
                          <span className="ml-1" style={{ color: '#94a3b8' }}>
                            ({(meal.plan_template_items || []).length} Zutaten)
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2.5 flex gap-4 text-xs font-medium" style={{ borderTop: '1px solid #f1f5f9', color: '#64748b' }}>
                      <span>{Math.round(totalKcal)} kcal</span>
                      <span>{Math.round(totalProtein * 10) / 10}g Protein</span>
                      <span>CHF {totalCost.toFixed(2)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Week plan templates tab */}
      {!loading && activeTab === 'week' && (
        <>
          {weekPlanTemplates.length === 0 ? (
            <div className="p-10 text-center text-sm rounded-2xl"
              style={{ background: 'white', border: '1px solid #f1f5f9', color: '#94a3b8', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              Noch keine Wochenplan-Vorlagen vorhanden.<br />
              <span className="text-xs">Plane eine vollständige Woche und speichere sie als Wochenplan.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {weekPlanTemplates.map(tmpl => {
                const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
                const allMeals = tmpl.plan_template_days.flatMap(d => d.plan_template_meals || [])
                const allItems = allMeals.flatMap(m => m.plan_template_items || [])
                const totalKcal = allItems.reduce((s, i) => s + Number(i.kcal), 0)
                const totalProtein = allItems.reduce((s, i) => s + Number(i.protein), 0)
                const totalCost = allItems.reduce((s, i) => s + Number(i.cost), 0)
                const sortedDays = [...tmpl.plan_template_days].sort((a, b) => a.day_offset - b.day_offset)
                return (
                  <div key={tmpl.id} className="p-5 rounded-2xl"
                    style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="font-semibold text-sm" style={{ color: '#1e293b' }}>{tmpl.name}</span>
                        <span className="text-xs ml-2 px-2 py-0.5 rounded-full" style={{ background: '#fffbeb', color: '#d97706' }}>Wochenplan</span>
                      </div>
                      <button onClick={() => removePlanTemplate(tmpl.id)}
                        className="text-xs transition-colors" style={{ color: '#dc2626' }}>Löschen</button>
                    </div>
                    <div className="space-y-2 mb-3">
                      {sortedDays.map(day => (
                        <div key={day.id}>
                          <p className="text-xs font-bold mb-0.5" style={{ color: '#475569' }}>{dayNames[day.day_offset] || `Tag ${day.day_offset + 1}`}</p>
                          <div className="flex flex-wrap gap-1">
                            {(day.plan_template_meals || []).map(m => (
                              <span key={m.id} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#64748b' }}>
                                {m.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2.5 flex gap-4 text-xs font-medium" style={{ borderTop: '1px solid #f1f5f9', color: '#64748b' }}>
                      <span>{Math.round(totalKcal)} kcal</span>
                      <span>{Math.round(totalProtein * 10) / 10}g Protein</span>
                      <span>CHF {totalCost.toFixed(2)}</span>
                      <span>{sortedDays.length} Tage</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {editingTemplate && (
        <TemplateEditModal
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => { setEditingTemplate(null); load() }}
        />
      )}

      {duplicatingTemplate && (
        <TemplateDuplicateModal
          template={duplicatingTemplate}
          onClose={() => setDuplicatingTemplate(null)}
          onSaved={() => { setDuplicatingTemplate(null); load() }}
        />
      )}

      {creatingTemplate && (
        <TemplateCreateModal
          onClose={() => setCreatingTemplate(false)}
          onSaved={() => { setCreatingTemplate(false); load() }}
        />
      )}
    </div>
  )
}
