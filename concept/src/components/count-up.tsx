'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getReducedMotionServerSnapshot() {
  return false
}

export function CountUp({ value }: { value: string }) {
  const parsed = useMemo(() => parseValue(value), [value])
  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  )
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  const [display, setDisplay] = useState(() => (parsed ? parsed.format(0) + parsed.suffix : value))

  const staticText = !parsed
    ? value
    : prefersReduced
      ? parsed.format(parsed.number) + parsed.suffix
      : null

  useEffect(() => {
    if (!parsed || prefersReduced) return
    const el = ref.current
    if (!el) return
    started.current = false

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
  }, [parsed, prefersReduced])

  return <span ref={ref}>{staticText ?? display}</span>
}
