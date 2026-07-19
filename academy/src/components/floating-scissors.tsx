'use client';

import { useEffect, useRef } from 'react';
import anime from 'animejs';

export function FloatingScissors() {
  const scissorsRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const bladeLeftRef = useRef<SVGGElement>(null);
  const bladeRightRef = useRef<SVGGElement>(null);

  // ===== SEGUIR MOUSE COM ANIME.JS =====
  useEffect(() => {
    const coords = { x: 0, y: 0 };

    const handleMouseMove = (e: MouseEvent) => {
      coords.x = e.clientX;
      coords.y = e.clientY;

      if (scissorsRef.current) {
        anime.set(scissorsRef.current, {
          left: coords.x - 30,
          top: coords.y - 30
        });
      }

      // Rotação suave baseada na posição do mouse
      if (svgRef.current) {
        const angle = (coords.x / window.innerWidth) * 10 - 5;
        anime.set(svgRef.current, {
          rotate: angle
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ===== ABRIR/FECHAR COM SCROLL =====
  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = windowHeight > 0 ? window.scrollY / windowHeight : 0;

      const rotationAmount = progress * 35;

      anime.set(bladeLeftRef.current, {
        rotate: -rotationAmount
      });

      anime.set(bladeRightRef.current, {
        rotate: rotationAmount
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ===== ANIMAÇÃO DE CORTE AO CLICAR =====
  const handleClick = () => {
    if (!svgRef.current) return;

    anime.timeline()
      .add({
        targets: bladeLeftRef.current,
        rotate: -45,
        duration: 150,
        easing: 'easeOutQuad'
      }, 0)
      .add({
        targets: bladeRightRef.current,
        rotate: 45,
        duration: 150,
        easing: 'easeOutQuad'
      }, 0)
      .add({
        targets: svgRef.current,
        scale: 0.85,
        duration: 100,
        easing: 'easeOutQuad'
      }, 0)
      .add({
        targets: bladeLeftRef.current,
        rotate: -25,
        duration: 200,
        easing: 'easeInOutQuad'
      }, 150)
      .add({
        targets: bladeRightRef.current,
        rotate: 25,
        duration: 200,
        easing: 'easeInOutQuad'
      }, 150)
      .add({
        targets: svgRef.current,
        scale: 1,
        duration: 200,
        easing: 'easeInOutQuad'
      }, 150);
  };

  // ===== ANIMAÇÃO DE ENTRADA =====
  useEffect(() => {
    if (scissorsRef.current) {
      anime.set(scissorsRef.current, { opacity: 0, scale: 0 });
      anime.to(scissorsRef.current, {
        opacity: 1,
        scale: 1,
        duration: 800,
        delay: 300,
        easing: 'easeOutElastic(1, .6)'
      });
    }
  }, []);

  return (
    <div
      id="floatingScissors"
      ref={scissorsRef}
      onClick={handleClick}
      className="fixed top-0 left-0 w-[60px] h-[60px] pointer-events-auto z-[9999] cursor-pointer"
      style={{ perspective: '1000px' }}
    >
      <svg
        ref={svgRef}
        className="w-full h-full drop-shadow-xl"
        viewBox="0 0 120 160"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Gradientes metalizados */}
          <linearGradient id="metalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#f5f5f5', stopOpacity: 1 }} />
            <stop offset="30%" style={{ stopColor: '#ffffff', stopOpacity: 1 }} />
            <stop offset="50%" style={{ stopColor: '#e0e0e0', stopOpacity: 1 }} />
            <stop offset="70%" style={{ stopColor: '#c0c0c0', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#808080', stopOpacity: 1 }} />
          </linearGradient>

          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#d4d4d4', stopOpacity: 1 }} />
            <stop offset="50%" style={{ stopColor: '#a0a0a0', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#606060', stopOpacity: 1 }} />
          </linearGradient>

          <filter id="deepShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="3" dy="4" stdDeviation="3" floodOpacity="0.4" />
            <feDropShadow dx="1" dy="2" stdDeviation="1" floodOpacity="0.2" />
          </filter>
        </defs>

        {/* Lâmina Superior Esquerda */}
        <g ref={bladeLeftRef} style={{ transformOrigin: '60px 80px' }} filter="url(#deepShadow)">
          <path
            d="M 60 80 L 35 25 Q 32 20 25 18 Q 15 16 12 18 Q 8 20 10 26 Q 14 32 22 36 L 55 75 Z"
            fill="url(#metalGradient)"
            stroke="#505050"
            strokeWidth="1"
          />
          <path
            d="M 28 25 Q 32 22 35 24"
            stroke="#ffffff"
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
          />
          <circle cx="12" cy="24" r="7" fill="url(#ringGradient)" stroke="#404040" strokeWidth="1" />
          <circle cx="12" cy="24" r="4.5" fill="#e8e8e8" opacity="0.4" />
          <circle cx="12" cy="24" r="2.5" fill="none" stroke="#f0f0f0" strokeWidth="0.5" opacity="0.8" />
        </g>

        {/* Lâmina Inferior Direita */}
        <g ref={bladeRightRef} style={{ transformOrigin: '60px 80px' }} filter="url(#deepShadow)">
          <path
            d="M 60 80 L 35 135 Q 32 140 25 142 Q 15 144 12 142 Q 8 140 10 134 Q 14 128 22 124 L 55 85 Z"
            fill="url(#metalGradient)"
            stroke="#505050"
            strokeWidth="1"
          />
          <path
            d="M 28 135 Q 32 138 35 136"
            stroke="#ffffff"
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
          />
          <circle cx="12" cy="136" r="7" fill="url(#ringGradient)" stroke="#404040" strokeWidth="1" />
          <circle cx="12" cy="136" r="4.5" fill="#e8e8e8" opacity="0.4" />
          <circle cx="12" cy="136" r="2.5" fill="none" stroke="#f0f0f0" strokeWidth="0.5" opacity="0.8" />
        </g>

        {/* Pino/Parafuso Central */}
        <g filter="url(#deepShadow)">
          <circle cx="60" cy="80" r="5" fill="#b0b0b0" stroke="#606060" strokeWidth="0.8" />
          <circle cx="60" cy="80" r="3.5" fill="#d0d0d0" />
          <line x1="57" y1="80" x2="63" y2="80" stroke="#404040" strokeWidth="0.8" />
          <line x1="60" y1="77" x2="60" y2="83" stroke="#404040" strokeWidth="0.8" />
          <circle cx="60" cy="80" r="5" fill="none" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />
        </g>

        <text x="35" y="45" fontSize="6" fill="#808080" opacity="0.5" textAnchor="middle">Professional</text>
        <text x="35" y="115" fontSize="6" fill="#808080" opacity="0.5" textAnchor="middle">Scissors</text>
      </svg>
    </div>
  );
}
