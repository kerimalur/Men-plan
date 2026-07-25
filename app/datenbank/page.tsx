'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  listFoods, listFoodCategories, createFood, updateFood, deleteFood, importFoods,
} from '@/lib/db/foods'
import type { Food, FoodCategory, FoodUnit } from '@/lib/db/types'
import { useToast } from '@/components/Toast'
import Card, { CardLabel } from '@/components/ui/Card'
import Pill from '@/components/ui/Pill'
import Button, { IconButton } from '@/components/ui/Button'

interface FoodForm {
  name: string
  calories_per_100: string
  protein_per_100: string
  carbs_per_100: string
  fat_per_100: string
  cost_per_100: string
  unit: FoodUnit
  category_id: string
  calories_per_100g: string
  protein_per_100g: string
}

const EMPTY: FoodForm = {
  name: '', calories_per_100: '', protein_per_100: '', carbs_per_100: '', fat_per_100: '',
  cost_per_100: '', unit: 'g', category_id: '', calories_per_100g: '', protein_per_100g: '',
}

interface ImportRow {
  name: string
  calories_per_100: number
  protein_per_100: number
  carbs_per_100: number
  fat_per_100: number
  cost_per_100: number
  unit: FoodUnit
}

/**
 * Zeilenweiser Import.
 *
 * Format: Name; kcal; Protein; Kosten; Einheit[; KH; Fett]
 * Trennzeichen ist Semikolon oder Komma. Kohlenhydrate und Fett sind optional
 * und stehen am Ende, damit bestehende Listen unverändert funktionieren.
 */
function parseImportText(text: string): ImportRow[] {
  const rows: ImportRow[] = []
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const sep = line.includes(';') ? ';' : ','
    const parts = line.split(sep).map(p => p.trim())
    if (parts.length < 2) continue
    const [name, kcalRaw, proteinRaw, costRaw, unitRaw, carbsRaw, fatRaw] = parts
    if (!name) continue
    const num = (v?: string) => {
      const n = parseFloat((v ?? '').replace(',', '.'))
      return Number.isFinite(n) ? n : 0
    }
    const u = (unitRaw || 'g').toLowerCase().trim()
    rows.push({
      name,
      calories_per_100: num(kcalRaw),
      protein_per_100:  num(proteinRaw),
      cost_per_100:     num(costRaw),
      carbs_per_100:    num(carbsRaw),
      fat_per_100:      num(fatRaw),
      unit: u === 'ml' ? 'ml' : u === 'stk' ? 'stk' : 'g',
    })
  }
  return rows
}

export default function DatenbankPage() {
  const { toast } = useToast()

  const [foods, setFoods] = useState<Food[]>([])
  const [categories, setCategories] = useState<FoodCategory[]>([])
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string | 'none' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState<Food | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FoodForm>(EMPTY)
  const [saving, setSaving] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [fs, cs] = await Promise.all([
        listFoods({ search, categoryId: activeCat }),
        listFoodCategories(),
      ])
      setFoods(fs); setCategories(cs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lebensmittel konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [search, activeCat])

  useEffect(() => { void Promise.resolve().then(load) }, [load])

  function openAdd() {
    setEditing(null); setForm(EMPTY); setShowForm(true)
  }

  function openEdit(f: Food) {
    setEditing(f)
    setForm({
      name: f.name,
      calories_per_100: String(f.calories_per_100),
      protein_per_100:  String(f.protein_per_100),
      carbs_per_100:    String(f.carbs_per_100),
      fat_per_100:      String(f.fat_per_100),
      cost_per_100:     String(f.cost_per_100),
      unit: f.unit,
      category_id: f.category_id ?? '',
      calories_per_100g: f.calories_per_100g != null ? String(f.calories_per_100g) : '',
      protein_per_100g:  f.protein_per_100g  != null ? String(f.protein_per_100g)  : '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const num = (v: string) => {
      const n = parseFloat(v.replace(',', '.'))
      return Number.isFinite(n) ? n : 0
    }
    const data = {
      name: form.name.trim(),
      calories_per_100: num(form.calories_per_100),
      protein_per_100:  num(form.protein_per_100),
      carbs_per_100:    num(form.carbs_per_100),
      fat_per_100:      num(form.fat_per_100),
      cost_per_100:     num(form.cost_per_100),
      unit: form.unit,
      category_id: form.category_id || null,
      // Nur bei Stückware: erlaubt zusätzlich die Erfassung in Gramm.
      calories_per_100g: form.unit === 'stk' && form.calories_per_100g ? num(form.calories_per_100g) : null,
      protein_per_100g:  form.unit === 'stk' && form.protein_per_100g  ? num(form.protein_per_100g)  : null,
    }
    try {
      if (editing) await updateFood(editing.id, data)
      else await createFood(data)
      setShowForm(false)
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Speichern fehlgeschlagen', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function runImport() {
    const parsed = parseImportText(importText)
    if (parsed.length === 0) return
    setImporting(true)
    try {
      await importFoods(parsed)
      setImportText(''); setShowImport(false)
      await load()
      toast(`${parsed.length} Lebensmittel importiert`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import fehlgeschlagen', 'error')
    } finally {
      setImporting(false)
    }
  }

  const f = (value: string, key: keyof FoodForm) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-normal text-2xl text-text">Lebensmittel</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowImport(v => !v)}>Import</Button>
          <Button onClick={openAdd}>+ Neu</Button>
        </div>
      </div>

      {showImport && (
        <Card className="mb-4">
          <CardLabel>Zeilenweise importieren</CardLabel>
          <p className="text-xs text-text-muted mt-1 mb-2">
            Name; kcal; Protein; Kosten; Einheit; KH; Fett — eine Zeile pro Lebensmittel.
            Kohlenhydrate und Fett sind optional. Gleiche Namen werden aktualisiert.
          </p>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            rows={6}
            placeholder={'Poulet; 165; 31; 2.20; g; 0; 3.6\nReis; 350; 7; 0.25; g; 78; 1'}
            className="w-full p-3 rounded-inner bg-surface-alt border border-border-soft text-text text-sm outline-none resize-y placeholder:text-text-faint font-mono"
          />
          <Button fullWidth className="mt-2" onClick={runImport} disabled={importing || !importText.trim()}>
            {importing ? 'Importieren…' : `${parseImportText(importText).length} Zeilen importieren`}
          </Button>
        </Card>
      )}

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Suchen…"
        className="w-full min-h-11 px-4 mb-3 rounded-button bg-surface border border-border text-text text-sm outline-none placeholder:text-text-faint"
      />

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        <Pill variant={activeCat === null ? 'accent' : 'neutral'} onClick={() => setActiveCat(null)}>Alle</Pill>
        <Pill variant={activeCat === 'none' ? 'accent' : 'neutral'} onClick={() => setActiveCat('none')}>Ohne</Pill>
        {categories.map(c => (
          <Pill key={c.id} variant={activeCat === c.id ? 'accent' : 'neutral'} onClick={() => setActiveCat(c.id)}>
            {c.name}
          </Pill>
        ))}
      </div>

      {loading && <p className="text-sm text-center py-10 text-text-muted">Laden…</p>}

      {error && (
        <Card className="text-center">
          <p className="text-sm text-danger mb-3">{error}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); void load() }}>Erneut versuchen</Button>
        </Card>
      )}

      {!loading && !error && (
        <Card flush>
          {foods.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-text-muted">Keine Lebensmittel gefunden.</p>
          )}
          <ul className="px-5">
            {foods.map(food => (
              <li key={food.id} className="border-b border-border-soft last:border-0">
                <div className="flex items-center gap-2 py-2 min-h-11">
                  <button onClick={() => openEdit(food)} className="tap-inline flex-1 text-left min-w-0">
                    <span className="block text-sm text-text truncate">{food.name}</span>
                    <span className="block text-xs text-text-muted">
                      {food.calories_per_100} kcal · {food.protein_per_100} g P
                      {food.carbs_per_100 > 0 && ` · ${food.carbs_per_100} g KH`}
                      {food.fat_per_100 > 0 && ` · ${food.fat_per_100} g F`}
                      {food.cost_per_100 > 0 && ` · CHF ${Number(food.cost_per_100).toFixed(2)}`}
                      <span className="text-text-faint"> / {food.unit === 'stk' ? 'Stk.' : `100 ${food.unit}`}</span>
                    </span>
                  </button>
                  <button
                    onClick={async () => {
                      await deleteFood(food.id)
                      await load()
                    }}
                    aria-label={`${food.name} löschen`}
                    className="tap-inline text-text-faint hover:text-danger px-1"
                  >×</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Formular */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-text/30 backdrop-blur-sm">
          <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-surface rounded-t-card sm:rounded-card border border-border shadow-float">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
              <h2 className="font-display font-normal text-lg text-text">
                {editing ? 'Bearbeiten' : 'Neues Lebensmittel'}
              </h2>
              <IconButton label="Schliessen" onClick={() => setShowForm(false)}>×</IconButton>
            </div>

            <div className="p-5 flex flex-col gap-3">
              <Field label="Name">
                <input
                  type="text" value={form.name} onChange={e => f(e.target.value, 'name')}
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Kalorien"><NumInput value={form.calories_per_100} onChange={v => f(v, 'calories_per_100')} /></Field>
                <Field label="Protein (g)"><NumInput value={form.protein_per_100} onChange={v => f(v, 'protein_per_100')} /></Field>
                <Field label="Kohlenhydrate (g)"><NumInput value={form.carbs_per_100} onChange={v => f(v, 'carbs_per_100')} /></Field>
                <Field label="Fett (g)"><NumInput value={form.fat_per_100} onChange={v => f(v, 'fat_per_100')} /></Field>
                <Field label="Kosten (CHF)"><NumInput value={form.cost_per_100} onChange={v => f(v, 'cost_per_100')} /></Field>
                <Field label="Einheit">
                  <select
                    value={form.unit}
                    onChange={e => f(e.target.value, 'unit')}
                    className={inputCls}
                  >
                    <option value="g">pro 100 g</option>
                    <option value="ml">pro 100 ml</option>
                    <option value="stk">pro Stück</option>
                  </select>
                </Field>
              </div>

              <Field label="Kategorie">
                <select value={form.category_id} onChange={e => f(e.target.value, 'category_id')} className={inputCls}>
                  <option value="">Keine</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              {form.unit === 'stk' && (
                <div className="rounded-inner bg-surface-alt p-3">
                  <CardLabel>Zusätzlich pro 100 g</CardLabel>
                  <p className="text-xs text-text-muted mt-1 mb-2">
                    Optional. Damit lässt sich dasselbe Lebensmittel wahlweise in Stück oder in Gramm erfassen.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Kalorien / 100 g"><NumInput value={form.calories_per_100g} onChange={v => f(v, 'calories_per_100g')} /></Field>
                    <Field label="Protein / 100 g"><NumInput value={form.protein_per_100g} onChange={v => f(v, 'protein_per_100g')} /></Field>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-border-soft flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setShowForm(false)}>Abbrechen</Button>
              <Button fullWidth onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Speichern…' : 'Speichern'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls =
  'w-full min-h-11 px-3 rounded-button bg-surface-alt border border-border text-text text-sm outline-none placeholder:text-text-faint'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <CardLabel>{label}</CardLabel>
      {children}
    </label>
  )
}

function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="0"
      className={inputCls}
    />
  )
}
