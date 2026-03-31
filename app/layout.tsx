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
      <body className="antialiased" style={{ background: '#f8fafc' }}>
        <div className="min-h-screen flex flex-col">
          <main className="flex-1 overflow-y-auto main-content px-5 pt-6 pb-4" style={{ background: '#f8fafc' }}>
            {children}
          </main>
          <Navigation />
        </div>
      </body>
    </html>
  )
}
