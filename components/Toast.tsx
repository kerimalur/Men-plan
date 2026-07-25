'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

type ToastType = 'error' | 'success' | 'info'

interface ToastOptions {
  /** Beschriftung der Aktion, z.B. „Rückgängig". */
  actionLabel?: string
  onAction?: () => void
  /** Anzeigedauer in ms. Undo-Toasts laufen 5000. */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void
  /**
   * Löschen ohne Bestätigungsdialog: entfernt sofort und bietet 5 Sekunden
   * lang „Rückgängig" an (Phase 4.1 des Umbaus).
   */
  toastUndo: (message: string, onUndo: () => void) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {}, toastUndo: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const STYLES: Record<ToastType, string> = {
  error:   'bg-danger-soft text-danger border-danger',
  success: 'bg-success-soft text-success border-success',
  info:    'bg-accent-soft text-accent border-accent',
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) { clearTimeout(timer); timers.current.delete(id) }
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'error', options: ToastOptions = {}) => {
    const id = nextId++
    const duration = options.duration ?? 4000
    setToasts(prev => [...prev, { id, message, type, ...options }])
    timers.current.set(id, setTimeout(() => dismiss(id), duration))
  }, [dismiss])

  const toastUndo = useCallback((message: string, onUndo: () => void) => {
    toast(message, 'info', { actionLabel: 'Rückgängig', onAction: onUndo, duration: 5000 })
  }, [toast])

  return (
    <ToastContext.Provider value={{ toast, toastUndo }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:max-w-sm">
          {toasts.map(t => (
            <div
              key={t.id}
              className={`rounded-inner border px-4 py-3 text-sm font-medium shadow-float animate-slide-in flex items-center gap-3 ${STYLES[t.type]}`}
            >
              <span className="flex-1">{t.message}</span>
              {t.actionLabel && (
                <button
                  onClick={() => { t.onAction?.(); dismiss(t.id) }}
                  className="tap-inline shrink-0 font-semibold underline underline-offset-2"
                >
                  {t.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}
