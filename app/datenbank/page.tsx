'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Food {
  id: string
  name: string
  calories_per_100: number
  protein_per_100: number
  cost_per_100: number
  unit: 'g' | 'ml'
}

interface FoodForm {
  name: string
  calories_per_100: string
  protein_per_100: string
  cost_per_100: string
  unit: 'g' | 'ml'
}

const emptyForm: FoodForm = {
  name: '', calories_per_100: '', protein_per_100: '', cost_per_100: '', unit: 'g',
}

export default function DatenbankPage() {
  const [foods, setFoods] = useState<Food[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Food | null>(null)
  const [form, setForm] = useState<FoodForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadFoods() }, [search])

  async function loadFoods() {
    let q = supabase.from('foods').select('*').order('name')
    if (search.trim()) q = q.ilike('name', `%${search.trim()}%`)
    const { data } = await q
    setFoods(data || [])
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(food: Food) {
    setEditing(food)
    setForm({
      name:             food.name,
      calories_per_100: String(food.calories_per_100),
      protein_per_100:  String(food.protein_per_100),
      cost_per_100:     String(food.cost_per_100),
      unit:             food.unit,
    })
    setShowModal(true)
  }

  async function save() {
    if (!form.name || form.calories_per_100 === '') return
    setSaving(true)
    const data = {
      name:             form.name.trim(),
      calories_per_100: parseFloat(form.calories_per_100),
      protein_per_100:  parseFloat(form.protein_per_100) || 0,
      cost_per_100:     parseFloat(form.cost_per_100) || 0,
      unit:             form.unit,
    }
    if (editing) {
      await supabase.from('foods').update(data).eq('id', editing.id)
    } else {
      await supabase.from('foods').insert(data)
    }
    setSaving(false)
    setShowModal(false)
    await loadFoods()
  }

  async function remove(id: string) {
    if (!confirm('Lebensmittel wirklich löschen?')) return
    await supabase.from('foods').delete().eq('id', id)
    await loadFoods()
  }

  const f = (v: string, field: keyof FoodForm) => setForm(prev => ({ ...prev, [field]: v }))

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'white',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  }

  const selectStyle: React.CSSProperties = {
    background: '#1e293b',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'white',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">Lebensmittel-Datenbank</h1>
        <button
          onClick={openAdd}
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
          className="text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
        >
          + Hinzufügen
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Suchen…"
        style={{
          ...inputStyle,
          marginBottom: '1rem',
        }}
      />

      {/* Table */}
      <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '1rem', overflow: 'hidden' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.04)' }}>
              <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Name</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>kcal</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Protein</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>CHF</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>je</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {foods.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm" style={{ color: '#64748b' }}>
                  {search ? 'Keine Ergebnisse.' : 'Noch keine Lebensmittel eingetragen.'}
                </td>
              </tr>
            )}
            {foods.map(food => (
              <tr
                key={food.id}
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                className="transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td className="px-5 py-3 font-medium text-white">{food.name}</td>
                <td className="px-4 py-3 text-right" style={{ color: '#94a3b8' }}>{food.calories_per_100}</td>
                <td className="px-4 py-3 text-right" style={{ color: '#94a3b8' }}>{food.protein_per_100}g</td>
                <td className="px-4 py-3 text-right" style={{ color: '#94a3b8' }}>{Number(food.cost_per_100).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-xs" style={{ color: '#64748b' }}>100{food.unit}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(food)} className="text-xs text-indigo-400 hover:text-indigo-300 mr-3 transition-colors">Bearbeiten</button>
                  <button onClick={() => remove(food.id)} className="text-xs transition-colors" style={{ color: '#f87171' }}
                    onMouseEnter={e => ((e.target as HTMLElement).style.color = '#ef4444')}
                    onMouseLeave={e => ((e.target as HTMLElement).style.color = '#f87171')}
                  >Löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem' }} className="w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="font-semibold text-white text-sm">
                {editing ? 'Lebensmittel bearbeiten' : 'Lebensmittel hinzufügen'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Name</label>
                <input type="text" value={form.name} onChange={e => f(e.target.value, 'name')}
                  placeholder="z.B. Haferflocken"
                  style={inputStyle}
                />
              </div>
              {/* Unit */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>Einheit</label>
                <select value={form.unit} onChange={e => f(e.target.value as 'g' | 'ml', 'unit')}
                  style={selectStyle}
                >
                  <option value="g">Gramm (Feststoff)</option>
                  <option value="ml">Milliliter (Flüssigkeit)</option>
                </select>
              </div>
              {/* Nutrition + cost */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: `kcal / 100${form.unit}`, field: 'calories_per_100' as const, placeholder: '0', step: '1' },
                  { label: `Protein / 100${form.unit}`, field: 'protein_per_100' as const, placeholder: '0', step: '0.1' },
                  { label: `CHF / 100${form.unit}`, field: 'cost_per_100' as const, placeholder: '0.00', step: '0.01' },
                ].map(({ label, field, placeholder, step }) => (
                  <div key={field}>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#94a3b8' }}>{label}</label>
                    <input type="number" value={form[field]} onChange={e => f(e.target.value, field)}
                      placeholder={placeholder} min="0" step={step}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Abbrechen
              </button>
              <button
                onClick={save}
                disabled={!form.name || saving}
                className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 transition-colors"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
