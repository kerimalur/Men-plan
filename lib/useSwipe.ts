import { useRef, useCallback, useEffect } from 'react'

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

export function useSwipe(handlers: SwipeHandlers, threshold = 50) {
  const startX = useRef(0)
  const startY = useRef(0)
  const tracking = useRef(false)

  const onTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    tracking.current = true
  }, [])

  const onTouchEnd = useCallback((e: TouchEvent) => {
    if (!tracking.current) return
    tracking.current = false
    const dx = e.changedTouches[0].clientX - startX.current
    const dy = e.changedTouches[0].clientY - startY.current
    if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx)) return
    if (dx < 0) handlers.onSwipeLeft?.()
    else handlers.onSwipeRight?.()
  }, [handlers, threshold])

  useEffect(() => {
    const el = document.body
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [onTouchStart, onTouchEnd])
}
