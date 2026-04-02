'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  {
    href: '/', exact: true, label: 'Home',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    href: '/kalender', label: 'Kalender',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  },
  {
    href: `/tag/${new Date().toISOString().split('T')[0]}`, matchPrefix: '/tag/', label: 'Übersicht',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  },
  {
    href: '/datenbank', label: 'Daten',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>,
  },
  {
    href: '/einkaufsliste', label: 'Einkauf',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
  },
]

const moreItems = [
  {
    href: '/notizen', label: 'Notizen',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  },
  {
    href: '/vorlagen', label: 'Vorlagen',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    href: '/einstellungen', label: 'Einstellungen',
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
]

export default function Navigation() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)

  function isActive(item: typeof navItems[0]) {
    if ('exact' in item && item.exact) return pathname === item.href
    if ('matchPrefix' in item && item.matchPrefix) return pathname.startsWith(item.matchPrefix as string)
    return pathname.startsWith(item.href)
  }

  const isMoreActive = moreItems.some(item => pathname.startsWith(item.href))

  return (
    <>
      {/* Overlay */}
      {showMore && (
        <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
      )}

      {/* More menu popup */}
      {showMore && (
        <div className="fixed bottom-[4.5rem] right-3 z-50 rounded-2xl shadow-lg py-2 min-w-[11rem]"
          style={{ background: 'white', border: '1px solid #e2e8f0' }}>
          {moreItems.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                onClick={() => setShowMore(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                style={{ color: active ? '#475569' : '#64748b', fontWeight: active ? 600 : 400 }}>
                <span style={{ color: active ? '#475569' : '#94a3b8' }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>
      )}

      {/* Bottom dock */}
      <nav className="fixed bottom-0 left-0 right-0 z-30"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderTop: '1px solid #e2e8f0',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        <div className="flex items-center justify-around px-2 h-16 max-w-lg mx-auto">
          {navItems.map(item => {
            const active = isActive(item)
            return (
              <Link key={item.href} href={item.href}
                className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl transition-all min-w-[3.5rem]"
                style={{ color: active ? '#1e293b' : '#94a3b8' }}>
                <span style={{ color: active ? '#475569' : '#94a3b8' }}>{item.icon}</span>
                <span className="text-[10px] font-medium" style={{ color: active ? '#1e293b' : '#94a3b8' }}>
                  {item.label}
                </span>
                {active && (
                  <span className="w-1 h-1 rounded-full" style={{ background: '#475569', marginTop: '1px' }} />
                )}
              </Link>
            )
          })}
          {/* More button */}
          <button
            onClick={() => setShowMore(v => !v)}
            className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl transition-all min-w-[3.5rem]"
            style={{ color: isMoreActive ? '#1e293b' : '#94a3b8' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            <span className="text-[10px] font-medium" style={{ color: isMoreActive ? '#1e293b' : '#94a3b8' }}>
              Mehr
            </span>
            {isMoreActive && (
              <span className="w-1 h-1 rounded-full" style={{ background: '#475569', marginTop: '1px' }} />
            )}
          </button>
        </div>
      </nav>
    </>
  )
}
