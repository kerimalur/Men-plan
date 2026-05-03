'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface ToastItem {
  id: number
  message: string
  type: 'error' | 'success' | 'info'
}

interface ToastContextValue {
  toast: (message: string, type?: 'error' | 'success' | 'info') => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, type: 'error' | 'success' | 'info' = 'error') => {
    const id = nextId++
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2" style={{ maxWidth: '22rem' }}>
          {toasts.map(t => (
            <div
              key={t.id}
              className="rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-slide-in"
              style={{
                background: t.type === 'error' ? '#fef2f2' : t.type === 'success' ? '#f0fdf4' : '#eff6ff',
                color: t.type === 'error' ? '#991b1b' : t.type === 'success' ? '#166534' : '#1e40af',
                border: `1px solid ${t.type === 'error' ? '#fecaca' : t.type === 'success' ? '#bbf7d0' : '#bfdbfe'}`,
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
