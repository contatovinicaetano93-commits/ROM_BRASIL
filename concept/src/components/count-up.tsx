'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'

function parseValue(raw: string) {
  const match = raw.match(/^([\d.,]+)(.*)$/)
  if (!match) return null

  const [, numStr, suffix] = match
  const usesThousandDot = numStr.includes('.') && !numStr.includes(',')
  const number = Number(numStr.replace(/\./g, '').replace(',', '.'))
  if (Number.isNaN(number)) return null

  const format = (n: number) =>
    usesThousandDot ? Math.round(n).toLocaleString('pt-BR') : String(Math.round(n))

  return { number, suffix, format }
}

export function CountUp({ value }: { value: string }) {
  const parsed = useMemo(() => parseValue(value), [value])
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  const [display, setDisplay] = useState(() => (parsed ? parsed.format(0) + parsed.suffix : value))

  useEffect(() => {
    if (!parsed) return
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const next = parsed.format(parsed.number) + parsed.suffix
      // Preferência do SO: aplicar depois do efeito (evita setState síncrono no body).
      queueMicrotask(() => setDisplay(next))
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true

        const counter = { value: 0 }
        gsap.to(counter, {
          value: parsed.number,
          duration: 1.2,
          ease: 'power2.out',
          onUpdate: () => {
            setDisplay(parsed.format(counter.value) + parsed.suffix)
          },
        })
      },
      { threshold: 0.4 },
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [parsed])

  return <span ref={ref}>{display}</span>
}
