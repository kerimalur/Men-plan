'use client'

import { useState, useEffect } from 'react'
import { loadSettings, saveSetting } from '@/lib/settings'
import { supabase } from '@/lib/supabase'

interface Field {
  key: string
  label: string
  description: string
  unit: string
  min: number
  step: number
}

const FIELDS: Field[] = [
  { key: 'kcal_ziel',    label: 'Kalorienziel',  description: 'Tägliches Kaloriendefizit oder -überschuss', unit: 'kcal', min: 500,  step: 50 },
  { key: 'protein_ziel', label: 'Proteinziel',   description: 'Tägliche Proteinmenge',                       unit: 'g',   min: 50,   step: 5 },
  { key: 'kosten_ziel',  label: 'Kostenbudget',  description: 'Tägliches Budget für Lebensmittel',           unit: 'CHF', min: 5,    step: 1 },
]

const MEAL_TYPE_LABELS: Record<string, string> = {
  fruehstueck: 'Frühstück',
  mittagessen: 'Mittagessen',
  abendessen:  'Abendessen',
  snack:       'Snack',
}

const EVENT_LABELS: Record<string, string> = {
  training:   'Trainingstag',
  eingeladen: 'Eingeladen / Auswärts',
}

interface MealTemplate { id: string; name: string; meal_type: string }
interface EventRule { id: string; event_type: string; meal_type: string; template_id: string; meal_templates: MealTemplate }

export default function EinstellungenPage() {
  const [values, setValues] = useState<Record<string, string>>({
    kcal_ziel: '2000', protein_ziel: '150', kosten_ziel: '20',
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Event rules
  const [rules, setRules] = useState<EventRule[]>([])
  const [templates, setTemplates] = useState<MealTemplate[]>([])
  const [addingRule, setAddingRule] = useState(false)
  const [newEvent, setNewEvent] = useState('training')
  const [newMealType, setNewMealType] = useState('fruehstueck')
  const [newTemplateId, setNewTemplateId] = useState('')

  useEffect(() => {
    loadSettings().then(data => { setValues(data); setLoading(false) })
    loadRules()
    supabase.from('meal_templates').select('id, name, meal_type').order('name')
      .then(({ data }) => setTemplates(data || []))
  }, [])

  async function loadRules() {
    const { data } = await supabase
      .from('event_meal_rules')
      .select('*, meal_templates(id, name, meal_type)')
      .order('created_at')
    setRules((data as EventRule[]) || [])
  }

  async function addRule() {
    if (!newTemplateId) return
    await supabase.from('event_meal_rules').insert({
      event_type: newEvent,
      meal_type: newMealType,
      template_id: newTemplateId,
    })
    setAddingRule(false)
    setNewTemplateId('')
    await loadRules()
  }

  async function deleteRule(id: string) {
    await supabase.from('event_meal_rules').delete().eq('id', id)
    await loadRules()
  }

  async function handleSave() {
    await Promise.all(Object.entries(values).map(([k, v]) => saveSetting(k, v)))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="text-center py-12 text-sm" style={{ color: '#64748b' }}>Laden…</div>

  const inputStyle: React.CSSProperties = {
    width: '6rem',
    background: 'white',
    border: '1px solid #e2e8f0',
    color: '#1e293b',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    textAlign: 'right',
    outline: 'none',
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-7">
        <h1 className="text-lg font-semibold" style={{ color: '#1e293b' }}>Einstellungen</h1>
        <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
          Ziele für Kalorien, Protein und Kosten — steuern die Farbanzeigen im Dashboard und Kalender.
        </p>
      </div>

      {/* Goal section */}
      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      >
        <div
          className="px-5 py-3.5"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: '#1e293b' }}>Tagesziele</h2>
        </div>
        <div>
          {FIELDS.map((f, idx) => (
            <div
              key={f.key}
              className="px-5 py-4 flex items-center gap-4"
              style={idx > 0 ? { borderTop: '1px solid #f1f5f9' } : {}}
            >
              <div className="flex-1">
                <label className="block text-sm font-medium" style={{ color: '#1e293b' }}>{f.label}</label>
                <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{f.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={values[f.key] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                  min={f.min}
                  step={f.step}
                  style={inputStyle}
                />
                <span className="text-xs w-8" style={{ color: '#94a3b8' }}>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Color legend */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: '#1e293b' }}>Farbskala</h2>
        <div className="space-y-2">
          {[
            { color: 'bg-green-500',  label: 'Grün',   desc: '≥ 100% des Ziels erreicht' },
            { color: 'bg-amber-500',  label: 'Orange', desc: '80–99% des Ziels erreicht' },
            { color: 'bg-red-500',    label: 'Rot',    desc: '< 80% des Ziels' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${item.color}`} />
              <span className="text-xs font-medium w-12" style={{ color: '#1e293b' }}>{item.label}</span>
              <span className="text-xs" style={{ color: '#94a3b8' }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Event-Meal Rules */}
      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{ background: 'white', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
      >
        <div
          className="px-5 py-3.5 flex items-center justify-between"
          style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}
        >
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#1e293b' }}>Event-Verknüpfungen</h2>
            <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>Mahlzeiten automatisch einfügen bei Events</p>
          </div>
          <button
            onClick={() => setAddingRule(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
            style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}
          >
            + Neu
          </button>
        </div>
        <div>
          {rules.length === 0 && !addingRule && (
            <p className="px-5 py-6 text-center text-xs" style={{ color: '#94a3b8' }}>
              Noch keine Regeln. z.B. «Trainingstag → Porridge zum Frühstück»
            </p>
          )}
          {rules.map((rule, idx) => (
            <div
              key={rule.id}
              className="px-5 py-3.5 flex items-center justify-between"
              style={idx > 0 ? { borderTop: '1px solid #f1f5f9' } : {}}
            >
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={rule.event_type === 'training'
                      ? { background: '#dbeafe', color: '#1d4ed8' }
                      : { background: '#ede9fe', color: '#6d28d9' }}>
                    {EVENT_LABELS[rule.event_type]}
                  </span>
                  <span className="text-xs" style={{ color: '#94a3b8' }}>→</span>
                  <span className="text-xs font-medium" style={{ color: '#64748b' }}>
                    {MEAL_TYPE_LABELS[rule.meal_type]}
                  </span>
                </div>
                <span className="text-sm font-semibold" style={{ color: '#1e293b' }}>
                  {rule.meal_templates?.name || 'Vorlage gelöscht'}
                </span>
              </div>
              <button onClick={() => deleteRule(rule.id)}
                className="text-xs transition-all" style={{ color: '#94a3b8' }}>
                Entfernen
              </button>
            </div>
          ))}

          {/* Add rule form */}
          {addingRule && (
            <div className="px-5 py-4 space-y-3" style={{ borderTop: rules.length > 0 ? '1px solid #f1f5f9' : 'none', background: '#fafbfc' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748b' }}>Event</label>
                  <select value={newEvent} onChange={e => setNewEvent(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid #e2e8f0', color: '#1e293b', background: 'white' }}>
                    <option value="training">Trainingstag</option>
                    <option value="eingeladen">Eingeladen</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#64748b' }}>Mahlzeit</label>
                  <select value={newMealType} onChange={e => setNewMealType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid #e2e8f0', color: '#1e293b', background: 'white' }}>
                    {Object.entries(MEAL_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#64748b' }}>Vorlage</label>
                <select value={newTemplateId} onChange={e => setNewTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid #e2e8f0', color: '#1e293b', background: 'white' }}>
                  <option value="">Vorlage wählen…</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({MEAL_TYPE_LABELS[t.meal_type] || t.meal_type})</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setAddingRule(false); setNewTemplateId('') }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#f1f5f9', color: '#64748b' }}>Abbrechen</button>
                <button onClick={addRule} disabled={!newTemplateId}
                  className="flex-1 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                  style={{ background: '#4f46e5' }}>Hinzufügen</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
        style={saved ? { background: '#16a34a' } : { background: '#475569' }}
      >
        {saved ? 'Gespeichert ✓' : 'Speichern'}
      </button>
    </div>
  )
}
