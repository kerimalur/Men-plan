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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Lebensmittel-Datenbank</h1>
        <button onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          + Hinzufügen
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Suchen…"
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
      />

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">kcal</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Protein</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">CHF</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">je</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {foods.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">
                  {search ? 'Keine Ergebnisse.' : 'Noch keine Lebensmittel eingetragen.'}
                </td>
              </tr>
            )}
            {foods.map(food => (
              <tr key={food.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900">{food.name}</td>
                <td className="px-4 py-3 text-right text-gray-600">{food.calories_per_100}</td>
                <td className="px-4 py-3 text-right text-gray-600">{food.protein_per_100}g</td>
                <td className="px-4 py-3 text-right text-gray-600">{Number(food.cost_per_100).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-gray-400 text-xs">100{food.unit}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(food)} className="text-xs text-indigo-500 hover:text-indigo-700 mr-3">Bearbeiten</button>
                  <button onClick={() => remove(food.id)} className="text-xs text-red-400 hover:text-red-600">Löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 text-sm">
                {editing ? 'Lebensmittel bearbeiten' : 'Lebensmittel hinzufügen'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Name</label>
                <input type="text" value={form.name} onChange={e => f(e.target.value, 'name')}
                  placeholder="z.B. Haferflocken"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {/* Unit */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Einheit</label>
                <select value={form.unit} onChange={e => f(e.target.value as 'g' | 'ml', 'unit')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
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
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
                    <input type="number" value={form[field]} onChange={e => f(e.target.value, field)}
                      placeholder={placeholder} min="0" step={step}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
                Abbrechen
              </button>
              <button onClick={save} disabled={!form.name || saving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-40 hover:bg-indigo-700 transition-colors">
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
