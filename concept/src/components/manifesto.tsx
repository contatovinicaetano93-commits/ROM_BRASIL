'use client'

import { Section } from '@/components/section'
import { AnimatedTextReveal } from '@/components/animated-text-reveal'
import { AnimatedSectionReveal } from '@/components/animated-section-reveal'
import { FloatingElement } from '@/components/floating-element'
import { DecorativeSvgDivider } from '@/components/decorative-svg-divider'
import { brand, partners } from '@/lib/content'

export function Manifesto() {
  return (
    <Section
      id="conceito"
      label="O conceito"
      title="O Conceito"
      className="relative overflow-hidden bg-surface/40"
    >
      {/* Floating decorative elements */}
      <FloatingElement
        duration={5}
        distance={15}
        delay={0}
        className="absolute top-20 right-10 w-1 h-1 rounded-full bg-gold/40 opacity-60"
      />
      <FloatingElement
        duration={6}
        distance={20}
        delay={0.5}
        className="absolute bottom-32 left-20 w-1.5 h-1.5 rounded-full bg-gold/30 opacity-50"
      />
      <FloatingElement
        duration={7}
        distance={12}
        delay={1}
        className="absolute top-1/2 right-1/4 w-0.5 h-0.5 rounded-full bg-gold/50 opacity-70"
      />
      <AnimatedSectionReveal direction="up" delay={0} className="mb-12">
        <h2 className="font-serif text-3xl leading-tight font-light tracking-tight text-foreground md:text-5xl">
          <AnimatedTextReveal className="block">{brand.promise}</AnimatedTextReveal>
        </h2>
        <p className="mt-6 text-base leading-relaxed text-muted md:text-lg">{brand.manifesto}</p>
      </AnimatedSectionReveal>

      <DecorativeSvgDivider />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--gold)_6%,transparent),transparent_70%)]" />

      <AnimatedSectionReveal direction="up" delay={0.2} className="relative z-10">
        <div className="grid items-start gap-4 md:grid-cols-3">
          {[
            { label: 'Visão', value: brand.vision },
            { label: 'Fundador', value: brand.founder },
            {
              label: 'Parceiros',
              value: partners.join(' · '),
            },
          ].map((item) => (
            <article key={item.label} className="card-border rounded-2xl p-6">
              <p className="section-label mb-3">{item.label}</p>
              <p className="text-base leading-relaxed text-foreground/90 md:text-lg">
                {item.value}
              </p>
            </article>
          ))}
        </div>
      </AnimatedSectionReveal>
    </Section>
  )
}
