import { useEffect, useState } from 'react'

/* ─────────────────────────────────────────────────
   SPLASH SCREEN — Karşılama Ekranı
   İlk açılışta ~2.4sn tüm ekranı kaplar, ortada neon
   yeşil vurgulu VibeGoal logosu belirir, ardından
   yumuşak fade-out ile uygulamaya geçilir.
───────────────────────────────────────────────── */
export default function SplashScreen({ onFinish }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // Görünür kalma süresi → fade-out tetikle
    const leaveTimer = setTimeout(() => setLeaving(true), 2200)
    // Fade-out tamamlanınca üst bileşene haber ver (unmount)
    const doneTimer = setTimeout(() => onFinish && onFinish(), 2850)
    return () => {
      clearTimeout(leaveTimer)
      clearTimeout(doneTimer)
    }
  }, [onFinish])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'radial-gradient(120% 120% at 50% 30%, #1c1c20 0%, #18181b 55%, #0c0c0e 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        gap: 22,
        fontFamily: "'Inter', 'Outfit', sans-serif",
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'scale(1.04)' : 'scale(1)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        pointerEvents: leaving ? 'none' : 'auto',
        overflow: 'hidden',
      }}
    >
      {/* Logo + neon glow ring */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Pulsing neon halka */}
        <div
          style={{
            position: 'absolute',
            width: 96,
            height: 96,
            borderRadius: 28,
            border: '2px solid rgba(163,230,53,0.5)',
            animation: 'vg-splash-ring 1.8s ease-out infinite',
          }}
        />
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            background: 'linear-gradient(135deg, #a3e635, #84cc16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 46,
            boxShadow: '0 0 30px rgba(163,230,53,0.45), 0 14px 40px rgba(0,0,0,0.5)',
            animation: 'vg-splash-pop 0.7s cubic-bezier(0.22,0.61,0.36,1) both, vg-neon-pulse 2s ease-in-out 0.7s infinite',
          }}
        >
          ⚽
        </div>
      </div>

      {/* Wordmark */}
      <div style={{ textAlign: 'center', animation: 'vg-splash-rise 0.7s ease 0.25s both' }}>
        <h1
          style={{
            fontSize: 38,
            fontWeight: 900,
            letterSpacing: '-1px',
            margin: 0,
            color: '#fafafa',
            lineHeight: 1,
          }}
        >
          Vibe<span style={{ color: '#a3e635', textShadow: '0 0 18px rgba(163,230,53,0.55)' }}>Goal</span>
        </h1>
        <p
          style={{
            marginTop: 10,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.32)',
          }}
        >
          Live Prediction Arena
        </p>
      </div>

      {/* Neon yükleme çubuğu */}
      <div
        style={{
          marginTop: 8,
          width: 150,
          height: 3,
          borderRadius: 99,
          background: 'rgba(255,255,255,0.07)',
          overflow: 'hidden',
          animation: 'vg-splash-rise 0.7s ease 0.45s both',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transformOrigin: 'left',
            background: 'linear-gradient(90deg, #84cc16, #a3e635)',
            boxShadow: '0 0 12px rgba(163,230,53,0.7)',
            animation: 'vg-splash-bar 2.1s ease-in-out both',
          }}
        />
      </div>
    </div>
  )
}
