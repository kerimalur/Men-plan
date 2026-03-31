import type { Metadata } from 'next'
import './globals.css'
import Navigation from '@/components/Navigation'

export const metadata: Metadata = {
  title: 'Menüplan',
  description: 'Mahlzeiten planen mit Kalorien, Protein und Kosten',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="antialiased" style={{ background: '#0f172a' }}>
        <div className="flex min-h-screen">
          <Navigation />
          <main className="flex-1 overflow-y-auto p-8" style={{ background: '#0f172a' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
