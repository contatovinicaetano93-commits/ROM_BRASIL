'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'

interface FloatingElementProps {
  children?: React.ReactNode
  duration?: number
  distance?: number
  delay?: number
  className?: string
}

export function FloatingElement({
  children,
  duration = 4,
  distance = 20,
  delay = 0,
  className = '',
}: FloatingElementProps) {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    gsap.fromTo(
      element,
      {
        y: 0,
        opacity: 0,
      },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        delay: delay,
        ease: 'power2.out',
      }
    )

    gsap.to(element, {
      y: -distance,
      duration: duration,
      delay: delay + 0.8,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    })
  }, [duration, distance, delay])

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  )
}
