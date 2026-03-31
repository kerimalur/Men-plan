'use client'

import { useState, useEffect } from 'react'
import { loadSettings, saveSetting } from '@/lib/settings'

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

export default function EinstellungenPage() {
  const [values, setValues] = useState<Record<string, string>>({
    kcal_ziel: '2000', protein_ziel: '150', kosten_ziel: '20',
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings().then(data => { setValues(data); setLoading(false) })
  }, [])

  async function handleSave() {
    await Promise.all(Object.entries(values).map(([k, v]) => saveSetting(k, v)))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="text-center py-12 text-sm text-gray-400">Laden…</div>

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-7">
        <h1 className="text-lg font-semibold text-gray-900">Einstellungen</h1>
        <p className="text-xs text-gray-400 mt-1">
          Ziele für Kalorien, Protein und Kosten — steuern die Farbanzeigen im Dashboard und Kalender.
        </p>
      </div>

      {/* Goal section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-sm font-semibold text-gray-800">Tagesziele</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {FIELDS.map(f => (
            <div key={f.key} className="px-5 py-4 flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-900">{f.label}</label>
                <p className="text-xs text-gray-400 mt-0.5">{f.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={values[f.key] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                  min={f.min}
                  step={f.step}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-500 w-8">{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Color legend */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Farbskala</h2>
        <div className="space-y-2">
          {[
            { color: 'bg-green-500',  label: 'Grün',  desc: '≥ 100% des Ziels erreicht' },
            { color: 'bg-amber-500',  label: 'Orange', desc: '80–99% des Ziels erreicht' },
            { color: 'bg-red-500',    label: 'Rot',    desc: '< 80% des Ziels' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${item.color}`} />
              <span className="text-xs font-medium text-gray-700 w-12">{item.label}</span>
              <span className="text-xs text-gray-500">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
          saved
            ? 'bg-green-600 text-white'
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {saved ? 'Gespeichert ✓' : 'Speichern'}
      </button>
    </div>
  )
}
