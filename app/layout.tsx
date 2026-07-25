import type { Metadata } from 'next'
import { Caprasimo, Figtree } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/Navigation'
import { ToastProvider } from '@/components/Toast'

// Display: kräftige Serif, ausschliesslich für Titel, Sektionsüberschriften
// und grosse Kennzahlen — nie für Fliesstext, Labels oder Navigation.
const caprasimo = Caprasimo({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-caprasimo',
  display: 'swap',
})

// Body: alles andere.
const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-figtree',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Menüplan',
  description: 'Meal Prep planen: Rezepte pro Portion, Prep-Zyklen, Kochliste und Einkaufsliste',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${caprasimo.variable} ${figtree.variable}`}>
      <body className="antialiased bg-bg text-text">
        <ToastProvider>
          <div className="min-h-screen flex flex-col">
            <main className="flex-1 overflow-y-auto main-content px-5 pt-6 pb-4">
              {children}
            </main>
            <Navigation />
          </div>
        </ToastProvider>
      </body>
    </html>
  )
}
