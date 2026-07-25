'use client'

import Link from 'next/link'
import Card from '@/components/ui/Card'

const LINKS = [
  {
    href: '/rezepte', label: 'Rezepte',
    hint: 'Mengen pro Portion, Favoriten, Zubereitung',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />,
  },
  {
    href: '/datenbank', label: 'Lebensmittel',
    hint: 'Nährwerte, Preise, Kategorien, Import',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />,
  },
  {
    href: '/auswertung', label: 'Auswertung',
    hint: 'Wochenschnitt, Verlauf, Protein pro Franken',
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  },
  {
    href: '/einstellungen', label: 'Einstellungen',
    hint: 'Tagesziele, Standard-Frühstück, Event-Regeln',
    icon: <>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </>,
  },
]

export default function MehrPage() {
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="font-display font-normal text-2xl text-text mb-5">Mehr</h1>

      <div className="grid gap-3">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href}>
            <Card className="flex items-center gap-4">
              <span className="text-accent shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">{l.icon}</svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display font-normal text-base text-text">{l.label}</span>
                <span className="block text-xs text-text-muted mt-0.5">{l.hint}</span>
              </span>
              <span className="text-text-faint shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
