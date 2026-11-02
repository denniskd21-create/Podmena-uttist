import React, { useState, useEffect, useRef } from 'react';

interface SplashScreenProps {
  onMorphStart?: () => void;
  onComplete: () => void;
  headerLogoId?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onMorphStart,
  onComplete,
  headerLogoId = 'header-app-logo'
}) => {
  const [phase, setPhase] = useState<'intro' | 'morphing' | 'finished'>('intro');
  const [progress, setProgress] = useState(0);

  // Standalone flying logo data (immune to backdrop blur dissolve)
  const [flyData, setFlyData] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    deltaX: number;
    deltaY: number;
    scale: number;
  } | null>(null);
  const [isFlying, setIsFlying] = useState(false);

  const splashLogoRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isTriggeredRef = useRef(false);

  // Smoothly increment progress to 100% over 2.6 seconds (one complete 360° turn)
  useEffect(() => {
    const startTime = performance.now();
    const duration = 2600;

    let animId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (pct < 100) {
        animId = requestAnimationFrame(tick);
      } else {
        triggerMorph();
      }
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  const triggerMorph = () => {
    if (isTriggeredRef.current) return;
    isTriggeredRef.current = true;

    // Immediately trigger the main page reveal simultaneously
    if (onMorphStart) {
      onMorphStart();
    }

    const splashEl = splashLogoRef.current;
    const headerEl = document.getElementById(headerLogoId);

    if (splashEl) {
      const splashRect = splashEl.getBoundingClientRect();
      const headerRect = headerEl?.getBoundingClientRect() || {
        top: 14,
        left: 20,
        width: 36,
        height: 36
      };

      const splashCenterX = splashRect.left + splashRect.width / 2;
      const splashCenterY = splashRect.top + splashRect.height / 2;

      const headerCenterX = headerRect.left + headerRect.width / 2;
      const headerCenterY = headerRect.top + headerRect.height / 2;

      const deltaX = headerCenterX - splashCenterX;
      const deltaY = headerCenterY - splashCenterY;
      const scale = headerRect.width / (splashRect.width || 1);

      setFlyData({
        top: splashRect.top,
        left: splashRect.left,
        width: splashRect.width,
        height: splashRect.height,
        deltaX,
        deltaY,
        scale
      });

      setPhase('morphing');

      // Next frame: trigger flight directly to the header
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsFlying(true);
        });
      });
    } else {
      setPhase('morphing');
    }

    // Finish morph after transition duration
    setTimeout(() => {
      setPhase('finished');
      onComplete();
    }, 760);
  };

  if (phase === 'finished') {
    return null;
  }

  return (
    <>
      {/* Standalone Flying Logo: Flies smoothly across the dissolving backdrop into the header */}
      {flyData && (
        <img
          src="/logo.webp"
          alt="УТТиСТ"
          style={{
            position: 'fixed',
            top: `${flyData.top}px`,
            left: `${flyData.left}px`,
            width: `${flyData.width}px`,
            height: `${flyData.height}px`,
            transform: isFlying
              ? `translate3d(${flyData.deltaX}px, ${flyData.deltaY}px, 0) scale(${flyData.scale})`
              : 'translate3d(0, 0, 0) scale(1)',
            transformOrigin: 'center center',
            transition: isFlying
              ? 'transform 0.75s cubic-bezier(0.16, 1, 0.3, 1), filter 0.75s ease-out'
              : 'none',
            filter: isFlying
              ? 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))'
              : 'drop-shadow(0 0 25px rgba(59, 130, 246, 0.5))',
            zIndex: 9999,
            pointerEvents: 'none',
            objectFit: 'contain'
          }}
        />
      )}

      {/* Main splash screen backdrop with frosted glass dissolve (UNCHANGED as requested) */}
      <div
        ref={containerRef}
        onClick={triggerMorph}
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center select-none overflow-hidden cursor-pointer transition-all duration-700 ease-out ${
          phase === 'morphing'
            ? 'bg-[#0A0A0B]/0 backdrop-blur-none pointer-events-none'
            : 'bg-[#08080B] backdrop-blur-2xl'
        }`}
        style={{
          perspective: '1200px'
        }}
      >
        {/* Ambient background glow orbs */}
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
            phase === 'morphing' ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[500px] h-[320px] sm:h-[500px] bg-blue-600/15 rounded-full blur-[100px] animate-splash-glow" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] sm:w-[350px] h-[220px] sm:h-[350px] bg-cyan-500/10 rounded-full blur-[80px]" />
          
          {/* Subtle grid lines in background */}
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
              backgroundSize: '32px 32px'
            }}
          />
        </div>

        {/* Center Stage: ONLY Logo and Loading Bar */}
        <div className="relative z-10 flex flex-col items-center justify-center px-4 max-w-sm sm:max-w-md w-full text-center">
          {/* Logo Wrapper */}
          <div className="relative mb-6 sm:mb-8 flex items-center justify-center">
            {/* Subtle glowing ring behind logo */}
            <div
              className={`absolute -inset-4 sm:-inset-6 rounded-full bg-gradient-to-r from-blue-600/20 via-cyan-500/20 to-blue-600/20 blur-xl transition-opacity duration-500 ${
                phase === 'morphing' ? 'opacity-0' : 'opacity-100'
              }`}
            />

            <img
              ref={splashLogoRef}
              src="/logo.webp"
              alt="Подмена — УТТиСТ"
              className={`w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 object-contain select-none will-change-transform ${
                phase === 'intro' ? 'animate-splash-360' : 'opacity-0'
              }`}
            />
          </div>

          {/* Loading progress bar & percentage only (no text) */}
          <div
            className={`w-44 sm:w-52 mx-auto transition-all duration-300 ${
              phase === 'morphing'
                ? 'opacity-0 -translate-y-4 scale-95 pointer-events-none'
                : 'opacity-100 translate-y-0 scale-100'
            }`}
          >
            <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-400 rounded-full transition-all duration-150 ease-out shadow-sm shadow-cyan-400/50"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-center text-xs font-mono font-bold text-blue-400/90 mt-2">
              <span>{progress}%</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
