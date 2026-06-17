/* ═══════════════════════════════════════════════════════════════
   VIBEGOAL — Otonom Ses Motoru (Web Audio API)
   
   Harici .mp3 dosyasına bağımlılık SIFIR.
   Tarayıcının kendi AudioContext altyapısını kullanarak
   otonom çıt (click) ve çift tonlu (goal) ses efektleri üretir.
   
   Kullanım:
     import { playClickSound, playGoalSound, playSendSound } from './audioEngine'
     
     onClick={() => playClickSound()}      // Buton tıklama
     onGoal={() => playGoalSound()}        // Gol olayı
     onSend={() => playSendSound()}        // Mesaj gönderme
═══════════════════════════════════════════════════════════════ */

let audioCtx = null

function getAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      console.warn('[VibeGoal Audio] Web Audio API desteklenmiyor:', e)
      return null
    }
  }
  // Resume if suspended (mobile browsers often require user gesture)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/** Ayarlardan ses efekti etkin mi kontrol et */
function isSoundEnabled() {
  try {
    return localStorage.getItem('vg_settings_sound') !== 'false'
  } catch {
    return true
  }
}

/* ─────────────────────────────────────────────────
   CLICK SES — Kısa, keskin tık sesi
   Tahmin butonları ve genel tıklama aksiyonları için.
───────────────────────────────────────────────── */
export function playClickSound() {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(1200, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.06)

  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.08)
}

/* ─────────────────────────────────────────────────
   GOAL SES — Çift tonlu zafer sesi 🎯⚽
   Gol olayı veya doğru tahmin geldiğinde tetiklenir.
   Kısa arpej: düşük ton → yüksek ton (kutlama hissi)
───────────────────────────────────────────────── */
export function playGoalSound() {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  // Ton 1 — düşük nota
  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(523.25, ctx.currentTime)  // C5
  gain1.gain.setValueAtTime(0.18, ctx.currentTime)
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
  osc1.connect(gain1)
  gain1.connect(ctx.destination)
  osc1.start(ctx.currentTime)
  osc1.stop(ctx.currentTime + 0.2)

  // Ton 2 — yüksek nota (arpej efekti)
  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.12)  // G5
  gain2.gain.setValueAtTime(0, ctx.currentTime)
  gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.12)
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
  osc2.connect(gain2)
  gain2.connect(ctx.destination)
  osc2.start(ctx.currentTime + 0.12)
  osc2.stop(ctx.currentTime + 0.4)

  // Ton 3 — en yüksek nota (final)
  const osc3 = ctx.createOscillator()
  const gain3 = ctx.createGain()
  osc3.type = 'sine'
  osc3.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.25)  // C6
  gain3.gain.setValueAtTime(0, ctx.currentTime)
  gain3.gain.setValueAtTime(0.15, ctx.currentTime + 0.25)
  gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55)
  osc3.connect(gain3)
  gain3.connect(ctx.destination)
  osc3.start(ctx.currentTime + 0.25)
  osc3.stop(ctx.currentTime + 0.55)
}

/* ─────────────────────────────────────────────────
   SEND SES — Mesaj gönderme sesi
   Kısa "swoosh" hissi — yumuşak frekans kayması.
───────────────────────────────────────────────── */
export function playSendSound() {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(600, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.1)

  gain.gain.setValueAtTime(0.12, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.12)
}

/* ─────────────────────────────────────────────────
   SUCCESS SES — Başarı / Puan kazanma sesi
   Düello kazanma veya tahmin kilitleme için.
───────────────────────────────────────────────── */
export function playSuccessSound() {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(880, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15)

  gain.gain.setValueAtTime(0.14, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.2)
}
