'use client';

import { useEffect, useRef } from 'react';

export function FloatingScissors() {
  const scissorsRef = useRef<HTMLDivElement>(null);
  const bladeLeftRef = useRef<SVGGElement>(null);
  const bladeRightRef = useRef<SVGGElement>(null);

  // ===== SEGUIR MOUSE =====
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!scissorsRef.current) return;

      const x = e.clientX - 30;
      const y = e.clientY - 30;

      scissorsRef.current.style.left = x + 'px';
      scissorsRef.current.style.top = y + 'px';
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ===== ABRIR/FECHAR COM SCROLL =====
  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = windowHeight > 0 ? window.scrollY / windowHeight : 0;

      // 0 a 25 graus conforme scroll
      const rotationAmount = progress * 25;

      if (bladeLeftRef.current) {
        bladeLeftRef.current.style.transform = `rotateZ(${-rotationAmount}deg)`;
      }

      if (bladeRightRef.current) {
        bladeRightRef.current.style.transform = `rotateZ(${rotationAmount}deg)`;
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ===== EFEITO EXTRA: Click na tesoura =====
  const handleClick = () => {
    if (bladeLeftRef.current && bladeRightRef.current) {
      // Abre ao máximo por um momento
      bladeLeftRef.current.style.transform = 'rotateZ(-30deg)';
      bladeRightRef.current.style.transform = 'rotateZ(30deg)';

      setTimeout(() => {
        // Volta ao normal
        const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = windowHeight > 0 ? window.scrollY / windowHeight : 0;
        const rotationAmount = progress * 25;

        if (bladeLeftRef.current) {
          bladeLeftRef.current.style.transform = `rotateZ(${-rotationAmount}deg)`;
        }
        if (bladeRightRef.current) {
          bladeRightRef.current.style.transform = `rotateZ(${rotationAmount}deg)`;
        }
      }, 150);
    }
  };

  return (
    <div
      id="floatingScissors"
      ref={scissorsRef}
      onClick={handleClick}
      className="fixed top-0 left-0 w-[60px] h-[60px] pointer-events-auto z-[9999] cursor-pointer transition-none"
    >
      <svg
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

          <filter id="innerShadow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>
        </defs>

        {/* Lâmina Superior Esquerda */}
        <g ref={bladeLeftRef} style={{ transformOrigin: '60px 80px', transition: 'transform 0.3s ease-out' }} filter="url(#deepShadow)">
          {/* Corpo da lâmina */}
          <path
            d="M 60 80 L 35 25 Q 32 20 25 18 Q 15 16 12 18 Q 8 20 10 26 Q 14 32 22 36 L 55 75 Z"
            fill="url(#metalGradient)"
            stroke="#505050"
            strokeWidth="1"
          />

          {/* Detalhe/Brilho superior */}
          <path
            d="M 28 25 Q 32 22 35 24"
            stroke="#ffffff"
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
          />

          {/* Anel superior */}
          <circle cx="12" cy="24" r="7" fill="url(#ringGradient)" stroke="#404040" strokeWidth="1" />
          <circle cx="12" cy="24" r="4.5" fill="#e8e8e8" opacity="0.4" />
          <circle cx="12" cy="24" r="2.5" fill="none" stroke="#f0f0f0" strokeWidth="0.5" opacity="0.8" />
        </g>

        {/* Lâmina Inferior Direita */}
        <g ref={bladeRightRef} style={{ transformOrigin: '60px 80px', transition: 'transform 0.3s ease-out' }} filter="url(#deepShadow)">
          {/* Corpo da lâmina */}
          <path
            d="M 60 80 L 35 135 Q 32 140 25 142 Q 15 144 12 142 Q 8 140 10 134 Q 14 128 22 124 L 55 85 Z"
            fill="url(#metalGradient)"
            stroke="#505050"
            strokeWidth="1"
          />

          {/* Detalhe/Brilho inferior */}
          <path
            d="M 28 135 Q 32 138 35 136"
            stroke="#ffffff"
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
          />

          {/* Anel inferior */}
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

        {/* Detalhe de texto nas lâminas */}
        <text x="35" y="45" fontSize="6" fill="#808080" opacity="0.5" textAnchor="middle">Professional</text>
        <text x="35" y="115" fontSize="6" fill="#808080" opacity="0.5" textAnchor="middle">Scissors</text>
      </svg>
    </div>
  );
}
/* tesoura 3D flutuante */
