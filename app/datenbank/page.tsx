'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Food {
  id: string
  name: string
  calories_per_100: number
  protein_per_100: number
  cost_per_100: number
  unit: 'g' | 'ml' | 'stk'
}

interface FoodForm {
  name: string
  calories_per_100: string
  protein_per_100: string
  cost_per_100: string
  unit: 'g' | 'ml' | 'stk'
}

interface ImportRow {
  name: string
  calories_per_100: number
  protein_per_100: number
  cost_per_100: number
  unit: 'g' | 'ml' | 'stk'
  error?: string
}

const emptyForm: FoodForm = {
  name: '', calories_per_100: '', protein_per_100: '', cost_per_100: '', unit: 'g',
}

function parseImportText(text: string): ImportRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const rows: ImportRow[] = []
  for (const line of lines) {
    const sep = line.includes(';') ? ';' : ','
    const parts = line.split(sep).map(p => p.trim())
    if (parts.length < 2) continue
    const [name, kcalRaw, proteinRaw, costRaw, unitRaw] = parts
    if (!name) continue
    const kcal = parseFloat(kcalRaw?.replace(',', '.') || '0')
    const protein = parseFloat(proteinRaw?.replace(',', '.') || '0')
    const cost = parseFloat(costRaw?.replace(',', '.') || '0')
    const unitClean = (unitRaw || 'g').toLowerCase().trim()
    const unit: 'g' | 'ml' | 'stk' = unitClean === 'ml' ? 'ml' : unitClean === 'stk' ? 'stk' : 'g'
    rows.push({ name, calories_per_100: isNaN(kcal) ? 0 : kcal, protein_per_100: isNaN(protein) ? 0 : protein, cost_per_100: isNaN(cost) ? 0 : cost, unit })
  }
  return rows
}

export default function DatenbankPage() {
  const [foods, setFoods] = useState<Food[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Food | null>(null)
  const [form, setForm] = useState<FoodForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Import
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

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
      unit:             food.unit as 'g' | 'ml' | 'stk',
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

  async function runImport() {
    const rows = parseImportText(importText)
    if (!rows.length) return
    setImporting(true)
    await supabase.from('foods').upsert(
      rows.map(r => ({
        name: r.name,
        calories_per_100: r.calories_per_100,
        protein_per_100: r.protein_per_100,
        cost_per_100: r.cost_per_100,
        unit: r.unit,
      })),
      { onConflict: 'name', ignoreDuplicates: false }
    )
    setImporting(false)
    setShowImport(false)
    setImportText('')
    await loadFoods()
  }

  const f = (v: string, field: keyof FoodForm) => setForm(prev => ({ ...prev, [field]: v }))

  const inputStyle: React.CSSProperties = {
    background: 'white',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
    borderRadius: '0.75rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  }

  const selectStyle: React.CSSProperties = {
    background: 'white',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
    borderRadius: '0.75rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold" style={{ color: '#1e293b' }}>Lebensmittel-Datenbank</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          >
            Importieren
          </button>
          <button
            onClick={openAdd}
            style={{ background: '#475569' }}
            className="text-white px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
          >
            + Hinzufügen
          </button>
        </div>
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
      <div style={{ background: 'white', border: '1px solid #f1f5f9', borderRadius: '1rem', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <th className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#94a3b8' }}>Name</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#94a3b8' }}>kcal</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#94a3b8' }}>Protein</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#94a3b8' }}>CHF</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wide" style={{ color: '#94a3b8' }}>je</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {foods.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm" style={{ color: '#94a3b8' }}>
                  {search ? 'Keine Ergebnisse.' : 'Noch keine Lebensmittel eingetragen.'}
                </td>
              </tr>
            )}
            {foods.map(food => (
              <tr
                key={food.id}
                style={{ borderTop: '1px solid #f1f5f9' }}
                className="transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td className="px-5 py-3 font-medium" style={{ color: '#1e293b' }}>{food.name}</td>
                <td className="px-4 py-3 text-right" style={{ color: '#64748b' }}>{food.calories_per_100}</td>
                <td className="px-4 py-3 text-right" style={{ color: '#64748b' }}>{food.protein_per_100}g</td>
                <td className="px-4 py-3 text-right" style={{ color: '#64748b' }}>{Number(food.cost_per_100).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-xs" style={{ color: '#94a3b8' }}>{food.unit === 'stk' ? '1 Stk.' : `100${food.unit}`}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(food)} className="text-xs mr-3 transition-colors" style={{ color: '#475569' }}
                    onMouseEnter={e => ((e.target as HTMLElement).style.color = '#1e293b')}
                    onMouseLeave={e => ((e.target as HTMLElement).style.color = '#475569')}
                  >Bearbeiten</button>
                  <button onClick={() => remove(food.id)} className="text-xs transition-colors" style={{ color: '#dc2626' }}
                    onMouseEnter={e => ((e.target as HTMLElement).style.color = '#b91c1c')}
                    onMouseLeave={e => ((e.target as HTMLElement).style.color = '#dc2626')}
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
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
        >
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '1rem' }} className="w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <h2 className="font-semibold text-sm" style={{ color: '#1e293b' }}>
                {editing ? 'Lebensmittel bearbeiten' : 'Lebensmittel hinzufügen'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Name</label>
                <input type="text" value={form.name} onChange={e => f(e.target.value, 'name')}
                  placeholder="z.B. Haferflocken"
                  style={inputStyle}
                />
              </div>
              {/* Unit */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Einheit</label>
                <select value={form.unit} onChange={e => f(e.target.value as 'g' | 'ml' | 'stk', 'unit')}
                  style={selectStyle}
                >
                  <option value="g">Gramm (Feststoff)</option>
                  <option value="ml">Milliliter (Flüssigkeit)</option>
                  <option value="stk">Stückzahl (pro Stück)</option>
                </select>
              </div>
              {/* Nutrition + cost */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: form.unit === 'stk' ? 'kcal / Stück' : `kcal / 100${form.unit}`, field: 'calories_per_100' as const, placeholder: '0', step: '1' },
                  { label: form.unit === 'stk' ? 'Protein / Stück' : `Protein / 100${form.unit}`, field: 'protein_per_100' as const, placeholder: '0', step: '0.1' },
                  { label: form.unit === 'stk' ? 'CHF / Stück' : `CHF / 100${form.unit}`, field: 'cost_per_100' as const, placeholder: '0.00', step: '0.01' },
                ].map(({ label, field, placeholder, step }) => (
                  <div key={field}>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>{label}</label>
                    <input type="number" value={form[field]} onChange={e => f(e.target.value, field)}
                      placeholder={placeholder} min="0" step={step}
                      style={inputStyle}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}
              >
                Abbrechen
              </button>
              <button
                onClick={save}
                disabled={!form.name || saving}
                className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40 transition-colors"
                style={{ background: '#475569' }}
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
        >
          <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '1rem' }} className="w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <h2 className="font-semibold text-sm" style={{ color: '#1e293b' }}>Lebensmittel importieren</h2>
              <button onClick={() => { setShowImport(false); setImportText('') }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-lg"
                style={{ color: '#94a3b8', background: '#f1f5f9' }}>×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-lg p-3 text-xs" style={{ background: '#f8fafc', border: '1px solid #f1f5f9', color: '#64748b' }}>
                <p className="font-semibold mb-1.5" style={{ color: '#475569' }}>Format (eine Zeile pro Lebensmittel):</p>
                <p className="font-mono">Name;Kalorien;Protein;CHF;Einheit</p>
                <p className="font-mono mt-1" style={{ color: '#94a3b8' }}>Haferflocken;370;13;0.80;g</p>
                <p className="font-mono" style={{ color: '#94a3b8' }}>Hühnerbrust;110;24;1.50;g</p>
                <p className="font-mono" style={{ color: '#94a3b8' }}>Ei;155;13;0.30;stk</p>
                <p className="mt-2" style={{ color: '#94a3b8' }}>Trennzeichen: Semikolon oder Komma. Einheit: g, ml oder stk.</p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#64748b' }}>Liste einfügen</label>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder={'Haferflocken;370;13;0.80;g\nHühnerbrust;110;24;1.50;g'}
                  rows={8}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              </div>
              {importText.trim() && (
                <div className="text-xs" style={{ color: '#64748b' }}>
                  {parseImportText(importText).length} Einträge erkannt
                </div>
              )}
            </div>
            <div className="px-6 py-4 flex justify-end gap-2" style={{ borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => { setShowImport(false); setImportText('') }}
                className="px-4 py-2 text-sm rounded-lg"
                style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}
              >
                Abbrechen
              </button>
              <button
                onClick={runImport}
                disabled={!importText.trim() || importing}
                className="px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-40"
                style={{ background: '#475569' }}
              >
                {importing ? 'Importieren…' : `${parseImportText(importText).length} importieren`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
