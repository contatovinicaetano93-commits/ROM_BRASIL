'use client';

import { useState, useRef } from 'react';
import { AboutRomeu } from '@/components/about-romeu'
import { Gallery } from '@/components/gallery'
import { Hero } from '@/components/hero'
import { Manifesto } from '@/components/manifesto'
import { SalonUnits } from '@/components/salon-units'
import { Services } from '@/components/services'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SocialProof } from '@/components/social-proof'
import { StickyCta } from '@/components/sticky-cta'

export default function Home() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => {});
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <SocialProof />
        <SalonUnits />
        <Services />
        <Manifesto />
        <AboutRomeu />
        <Gallery />
      </main>
      <SiteFooter />
      <StickyCta />

      <button
        data-music-player="true"
        onClick={togglePlay}
        style={{
          position: 'fixed',
          bottom: '32px',
          right: '32px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)',
          color: 'white',
          fontSize: '24px',
          cursor: 'pointer',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.transform = 'scale(1.1)';
          el.style.boxShadow = '0 25px 50px -12px rgba(251, 191, 36, 0.6)';
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.transform = 'scale(1)';
          el.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.3)';
        }}
        title="Playlist ROM Concept - Música Chic & Elegante"
        aria-label="Reproduzir música"
      >
        🎵
      </button>

      <div
        data-spotify-player="true"
        style={{
          position: 'fixed',
          bottom: '110px',
          right: '0px',
          zIndex: 9998,
          width: '100%',
          maxWidth: '330px',
          borderRadius: '12px 12px 0 0',
        }}
      >
        <iframe
          style={{
            borderRadius: '12px 12px 0 0',
            width: '100%',
            height: '380px',
            border: 'none',
          }}
          src="https://open.spotify.com/embed/playlist/4XVbHRYKnrX6ES2xWTKPmQ?utm_source=generator"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        ></iframe>
      </div>
    </>
  )
}
