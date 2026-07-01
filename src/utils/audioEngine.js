/* ═══════════════════════════════════════════════════════════════
   VIBEGOAL — Otonom Ses Motoru (Web Audio API)
   Harici dosya yok; Web Audio ile prosedürel efektler.
═══════════════════════════════════════════════════════════════ */

let audioCtx = null
let primed = false

function getAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      console.warn('[VibeGoal Audio] Web Audio API desteklenmiyor:', e)
      return null
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/** Mobil tarayıcılar için ilk dokunuşta ses bağlamını aç */
export function primeAudioContext() {
  if (primed) return
  const ctx = getAudioContext()
  if (!ctx) return
  primed = true
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.001, ctx.currentTime)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + 0.01)
}

export function isSoundEnabled() {
  try {
    return localStorage.getItem('vg_settings_sound') !== 'false'
  } catch {
    return true
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem('vg_settings_sound', String(enabled))
  } catch { /* ignore */ }
}

function playTone({
  type = 'sine',
  freqStart,
  freqEnd,
  start = 0,
  duration = 0.08,
  volume = 0.14,
  ramp = 'exp',
}) {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  const t0 = ctx.currentTime + start
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freqStart, t0)
  if (freqEnd != null) {
    if (ramp === 'exp') {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration)
    } else {
      osc.frequency.linearRampToValueAtTime(freqEnd, t0 + duration)
    }
  }
  gain.gain.setValueAtTime(volume, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function playChord(notes, { start = 0, spacing = 0.1, duration = 0.18, volume = 0.12 } = {}) {
  notes.forEach((freq, i) => {
    playTone({ freqStart: freq, start: start + i * spacing, duration, volume: volume - i * 0.02 })
  })
}

/** Genel buton / seçim tıklaması */
export function playClickSound() {
  playTone({ freqStart: 1200, freqEnd: 800, duration: 0.07, volume: 0.13 })
}

/** Alt navigasyon sekmesi */
export function playNavSound() {
  playTone({ type: 'triangle', freqStart: 520, freqEnd: 780, duration: 0.09, volume: 0.11 })
}

/** Draft / kart seçimi */
export function playPickSound() {
  playTone({ type: 'square', freqStart: 440, freqEnd: 660, duration: 0.1, volume: 0.09 })
  playTone({ type: 'sine', freqStart: 880, start: 0.05, duration: 0.08, volume: 0.07, freqEnd: 880 })
}

/** Mesaj gönderme */
export function playSendSound() {
  playTone({ freqStart: 600, freqEnd: 1400, duration: 0.11, volume: 0.11 })
}

/** Başarı / kazanma / giriş */
export function playSuccessSound() {
  playChord([523.25, 659.25, 783.99], { spacing: 0.08, duration: 0.16, volume: 0.13 })
}

/** Gol / büyük zafer */
export function playGoalSound() {
  playTone({ freqStart: 523.25, duration: 0.2, volume: 0.16, freqEnd: 523.25 })
  playTone({ freqStart: 783.99, start: 0.12, duration: 0.22, volume: 0.17, freqEnd: 783.99 })
  playTone({ freqStart: 1046.5, start: 0.24, duration: 0.28, volume: 0.14, freqEnd: 1046.5 })
}

/** Kaybetme */
export function playDefeatSound() {
  playTone({ type: 'triangle', freqStart: 440, freqEnd: 220, duration: 0.35, volume: 0.12, ramp: 'exp' })
  playTone({ type: 'triangle', freqStart: 330, freqEnd: 165, start: 0.12, duration: 0.4, volume: 0.1, ramp: 'exp' })
}

/** Hata / uyarı */
export function playErrorSound() {
  playTone({ type: 'sawtooth', freqStart: 280, freqEnd: 180, duration: 0.14, volume: 0.08 })
  playTone({ type: 'sawtooth', freqStart: 220, freqEnd: 140, start: 0.1, duration: 0.14, volume: 0.07 })
}

/** Davet / bildirim */
export function playNotifySound() {
  playTone({ type: 'triangle', freqStart: 880, freqEnd: 1174.66, duration: 0.12, volume: 0.12 })
  playTone({ type: 'triangle', freqStart: 1174.66, start: 0.1, duration: 0.14, volume: 0.1, freqEnd: 880 })
}

/** Tur tamamlandı / sonuç açılışı */
export function playRevealSound() {
  playTone({ type: 'sine', freqStart: 392, freqEnd: 523.25, duration: 0.2, volume: 0.11 })
  playTone({ type: 'sine', freqStart: 523.25, freqEnd: 659.25, start: 0.15, duration: 0.22, volume: 0.1 })
}
