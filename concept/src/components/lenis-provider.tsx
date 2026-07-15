'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

export function LenisProvider() {
  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      lerp: 0.1,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
      infinite: false,
      gestureOrientation: 'vertical',
      syncTouch: false,
      syncTouchLerp: 0.075,
      overscroll: true,
      smoothWheel: true,
    } as any)

    return () => {
      lenis.destroy()
    }
  }, [])

  return null
}
