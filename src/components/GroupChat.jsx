import { useState, useEffect, useRef, useCallback } from 'react'
import { playSendSound } from '../utils/audioEngine'

/* ─────────────────────────────────────────────────
   MOCK DATA — Grup sohbet geçmişi
───────────────────────────────────────────────── */
// ME objesi bileşen içinde dinamik tanımlanmaktadır.

const INITIAL_MESSAGES = []

const QUICK_REACTIONS = ['🔥', '💪', '😂', '📚', '🎯', '⚽', '❤️', '👏']

// Bot cevapları kaldırıldı

/* ─────────────────────────────────────────────────
   KEYFRAME INJECTION
───────────────────────────────────────────────── */
const CHAT_STYLE_ID = 'vg-chat-keyframes'
function injectChatStyles() {
  if (document.getElementById(CHAT_STYLE_ID)) return
  const s = document.createElement('style')
  s.id = CHAT_STYLE_ID
  s.textContent = `
    @keyframes bubble-in-left {
      from { opacity: 0; transform: translateX(-16px) scale(0.94); }
      to   { opacity: 1; transform: translateX(0)    scale(1); }
    }
    @keyframes bubble-in-right {
      from { opacity: 0; transform: translateX(16px)  scale(0.94); }
      to   { opacity: 1; transform: translateX(0)     scale(1); }
    }
    @keyframes system-msg-in {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes reaction-pop {
      0%   { transform: scale(0.6); opacity: 0; }
      60%  { transform: scale(1.2); }
      100% { transform: scale(1);   opacity: 1; }
    }
    @keyframes typing-dot {
      0%, 80%, 100% { transform: scale(0); opacity: 0.4; }
      40%            { transform: scale(1); opacity: 1; }
    }
    @keyframes unread-pulse {
      0%,100% { transform: scale(1); }
      50%      { transform: scale(1.15); }
    }
    @keyframes send-bounce {
      0%,100% { transform: scale(1); }
      40%      { transform: scale(0.93); }
      70%      { transform: scale(1.06); }
    }

    .chat-bubble-me:hover    .reaction-bar { opacity: 1 !important; transform: translateY(0) !important; }
    .chat-bubble-other:hover .reaction-bar { opacity: 1 !important; transform: translateY(0) !important; }
    .reaction-chip:hover  { background: rgba(255,255,255,0.15) !important; transform: scale(1.12); }
    .quick-reaction:hover { transform: scale(1.3) !important; }
    .send-btn:hover { filter: brightness(1.12); }
    .send-btn:active { animation: send-bounce 0.25s ease; }
    .chat-input:focus { outline: none; border-color: color-mix(in srgb, var(--vg-accent) 50%, transparent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--vg-accent) 10%, transparent); }
    .scroll-hide::-webkit-scrollbar { display: none; }
    .emoji-btn:hover { transform: scale(1.15); background: rgba(255,255,255,0.1) !important; }
  `
  document.head.appendChild(s)
}

/* ─────────────────────────────────────────────────
   TYPING INDICATOR
───────────────────────────────────────────────── */
function TypingIndicator({ name, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 8,
      padding: '0 16px', marginBottom: 4,
      animation: 'system-msg-in 0.3s ease both',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: `${color}20`, border: `1.5px solid ${color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, flexShrink: 0,
      }}>😊</div>

      <div style={{
        padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#666', display: 'inline-block',
            animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{name} yazıyor...</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   SYSTEM MESSAGE
───────────────────────────────────────────────── */
function SystemMessage({ msg }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center',
      padding: '6px 16px',
      animation: 'system-msg-in 0.3s ease both',
    }}>
      <div style={{
        padding: '7px 16px', borderRadius: 99,
        background: 'color-mix(in srgb, var(--vg-accent) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--vg-accent) 18%, transparent)',
        fontSize: 11, color: 'color-mix(in srgb, var(--vg-accent) 67%, transparent)', fontWeight: 600,
        textAlign: 'center', lineHeight: 1.5,
        maxWidth: '85%',
      }}>
        {msg.text}
        <span style={{ marginLeft: 8, fontSize: 10, color: 'color-mix(in srgb, var(--vg-accent) 33%, transparent)' }}>{msg.time}</span>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   FIX #3: REACTION BAR
   activeReactions: kullanıcının bu mesaja verdiği tepkiler (Set)
───────────────────────────────────────────────── */
function ReactionBar({ reactions, activeReactions, onToggle, isMe }) {
  const entries = Object.entries(reactions || {}).filter(([, c]) => c > 0)
  if (entries.length === 0) return null
  return (
    <div style={{
      display: 'flex', gap: 4, flexWrap: 'wrap',
      marginTop: 5,
      justifyContent: isMe ? 'flex-end' : 'flex-start',
    }}>
      {entries.map(([emoji, count]) => {
        const isMine = activeReactions?.has(emoji)
        return (
          <button
            key={emoji}
            className="reaction-chip"
            onClick={() => onToggle(emoji)}
            title={isMine ? 'Tepkini geri al' : 'Tepki ver'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '3px 9px', borderRadius: 99,
              background: isMine ? 'color-mix(in srgb, var(--vg-accent) 18%, transparent)' : 'rgba(255,255,255,0.08)',
              border: `1px solid ${isMine ? 'color-mix(in srgb, var(--vg-accent) 45%, transparent)' : 'rgba(255,255,255,0.1)'}`,
              color: isMine ? 'var(--vg-accent)' : '#ddd',
              fontSize: 12, cursor: 'pointer',
              fontFamily: 'Inter,sans-serif', fontWeight: 600,
              transition: 'all 0.15s ease',
              animation: 'reaction-pop 0.3s ease both',
              transform: 'scale(1)',
            }}
          >
            {emoji} <span style={{ fontSize: 10, color: isMine ? 'color-mix(in srgb, var(--vg-accent) 60%, transparent)' : '#aaa' }}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   CHAT BUBBLE
───────────────────────────────────────────────── */
function ChatBubble({ msg, onReact, showAvatar }) {
  const [showReactions, setShowReactions] = useState(false)
  const isMe = msg.isMe

  // FIX #3: toggle API’ya geç
  function handleReact(emoji) {
    onReact(msg.id, emoji)
    setShowReactions(false)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMe ? 'row-reverse' : 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: '2px 16px',
      animation: `${isMe ? 'bubble-in-right' : 'bubble-in-left'} 0.28s cubic-bezier(.22,.61,.36,1) both`,
    }}
    className={isMe ? 'chat-bubble-me' : 'chat-bubble-other'}
    >
      {/* Avatar */}
      {showAvatar ? (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: `${msg.color}20`, border: `1.5px solid ${msg.color}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, marginBottom: 2,
          overflow: 'hidden',
        }}>
          {msg.avatar && msg.avatar.startsWith('http') ? (
            <img src={msg.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.src = '😎' }} />
          ) : (
            msg.avatar
          )}
        </div>
      ) : (
        <div style={{ width: 30, flexShrink: 0 }} />
      )}

      {/* Content */}
      <div style={{
        maxWidth: '72%',
        display: 'flex', flexDirection: 'column',
        alignItems: isMe ? 'flex-end' : 'flex-start',
      }}>
        {/* Name + time */}
        {showAvatar && !isMe && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: msg.color,
            marginBottom: 3, letterSpacing: 0.3,
          }}>{msg.name}</div>
        )}

        {/* Bubble */}
        <div
          onDoubleClick={() => setShowReactions(r => !r)}
          style={{
            padding: '10px 14px',
            borderRadius: isMe
              ? '18px 18px 4px 18px'
              : '18px 18px 18px 4px',
            background: isMe
              ? 'linear-gradient(135deg,color-mix(in srgb, var(--vg-accent) 22%, transparent),color-mix(in srgb, var(--vg-accent-alt) 15%, transparent))'
              : 'rgba(255,255,255,0.07)',
            border: `1px solid ${isMe ? 'color-mix(in srgb, var(--vg-accent) 30%, transparent)' : 'rgba(255,255,255,0.08)'}`,
            cursor: 'default',
            position: 'relative',
            boxShadow: isMe
              ? '0 2px 12px color-mix(in srgb, var(--vg-accent) 10%, transparent)'
              : '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {/* Quick reaction float bar */}
          {showReactions && (
            <div style={{
              position: 'absolute',
              bottom: '100%', [isMe ? 'right' : 'left']: 0,
              marginBottom: 6,
              display: 'flex', gap: 4,
              background: 'rgba(30,30,40,0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12, padding: '6px 8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              zIndex: 10,
              animation: 'reaction-pop 0.2s ease both',
            }}>
              {QUICK_REACTIONS.map(e => (
                <button
                  key={e} className="quick-reaction"
                  onClick={() => handleReact(e)}
                  style={{
                    background: 'none', border: 'none',
                    fontSize: 18, cursor: 'pointer',
                    padding: '2px 3px', borderRadius: 6,
                    transition: 'transform 0.15s ease',
                  }}
                >{e}</button>
              ))}
            </div>
          )}

          <p style={{
            fontSize: 13.5, lineHeight: 1.55,
            color: isMe ? '#e6fff5' : '#e5e7eb',
            margin: 0,
          }}>{msg.text}</p>
        </div>

        {/* Reactions + time row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {isMe && (
            <span style={{ fontSize: 9, color: '#444' }}>{msg.time}</span>
          )}
          <ReactionBar
            reactions={msg.reactions}
            activeReactions={msg.myReactions}
            onToggle={e => onReact(msg.id, e)}
            isMe={isMe}
          />
          {!isMe && (
            <span style={{ fontSize: 9, color: '#444' }}>{msg.time}</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   DATE DIVIDER
───────────────────────────────────────────────── */
function DateDivider({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 16px',
    }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 1 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MAIN GROUP CHAT COMPONENT
───────────────────────────────────────────────── */
export default function GroupChat({ roomName = 'Grup Sohbeti', currentUser, userProfile, theme }) {
  useEffect(() => { injectChatStyles() }, [])

  const ME = {
    id: currentUser?.uid || 'me',
    name: userProfile?.username || currentUser?.username || 'Sen',
    avatar: userProfile?.avatar || currentUser?.avatar || '😎',
    color: 'var(--vg-accent)'
  }

  const [messages, setMessages]       = useState(INITIAL_MESSAGES)
  const [input, setInput]             = useState('')
  const [isTyping, setIsTyping]       = useState(false)
  const [typingName, setTypingName]   = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [isAtBottom, setIsAtBottom]   = useState(true)
  const [showEmojiPad, setEmojiPad]   = useState(false)

  const scrollRef   = useRef(null)
  const inputRef    = useRef(null)
  const typingTimer = useRef(null)

  /* Auto-scroll to bottom */
  function scrollToBottom(force = false) {
    if (!scrollRef.current) return
    if (force || isAtBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  useEffect(() => { scrollToBottom(true) }, [])

  useEffect(() => {
    scrollToBottom()
    if (!isAtBottom) setUnreadCount(c => c + 1)
  }, [messages])

  function handleScroll() {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40
    setIsAtBottom(atBottom)
    if (atBottom) setUnreadCount(0)
  }



  /* Mesaj gönder */
  function sendMessage() {
    const text = input.trim()
    if (!text) return

    const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    const newMsg = {
      id: `msg-${Date.now()}`,
      ...ME,
      text,
      time: now,
      reactions: {},
      type: 'text',
      isMe: true,
    }

    setMessages(prev => [...prev, newMsg])
    setInput('')
    setEmojiPad(false)
    setIsAtBottom(true)
    playSendSound()

    setTimeout(() => scrollToBottom(true), 50)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  /* Emoji picker (basit) */
  const EMOJIS = ['😂', '🔥', '⚽', '💪', '🎯', '😤', '🏆', '❤️', '👏', '😎', '🤔', '😅', '🇹🇷', '⚡', '📚', '🥇']

  /* FIX #3: Tepki ekle/kaldır — toggle mantığı
     - Kullanıcı o emojiyi daha önce basmadıysa: sayıyı +1 artır, myReactions'a ekle
     - Kullanıcı o emojiyi daha önce basmadıysa: sayıyı -1 azalt, myReactions'dan sil
     - Sayı 0'a düşerse emoji tamamen kalkar
  */
  function addReaction(msgId, emoji) {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m

      const myReactions  = new Set(m.myReactions || [])
      const newReactions = { ...m.reactions }
      const alreadyReacted = myReactions.has(emoji)

      if (alreadyReacted) {
        // Tepkiyi geri çek
        myReactions.delete(emoji)
        const newCount = (newReactions[emoji] || 1) - 1
        if (newCount <= 0) {
          delete newReactions[emoji]  // 0'a düşerse chip kaybolsun
        } else {
          newReactions[emoji] = newCount
        }
      } else {
        // Yeni tepki ver
        myReactions.add(emoji)
        newReactions[emoji] = (newReactions[emoji] || 0) + 1
      }

      return { ...m, reactions: newReactions, myReactions }
    }))
  }

  /* Mesaj gruplandırma: ardışık aynı kişiden gelenler */
  function shouldShowAvatar(messages, idx) {
    if (idx === 0) return true
    const prev = messages[idx - 1]
    const curr = messages[idx]
    if (prev.type === 'system') return true
    return prev.userId !== curr.userId
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      background: '#121212',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* ── CHAT HEADER BAR ─────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>💬</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb' }}># {roomName.toLowerCase().replace(/ /g, '-')}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 14, color: '#555' }}>
          <span title="Arama" style={{ cursor: 'pointer' }}>🔍</span>
          <span title="Üyeler" style={{ cursor: 'pointer' }}>👥</span>
        </div>
      </div>

      {/* ── MESSAGES ────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-hide"
        style={{
          flex: 1, overflowY: 'auto',
          padding: '12px 0',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}
      >
        <DateDivider label="BUGÜN" />

        {messages.map((msg, idx) => {
          if (msg.type === 'system') return <SystemMessage key={msg.id} msg={msg} />
          return (
            <ChatBubble
              key={msg.id}
              msg={msg}
              onReact={addReaction}
              showAvatar={shouldShowAvatar(messages, idx)}
            />
          )
        })}

        {/* Typing indicator */}
        {isTyping && <TypingIndicator name={typingName} color="#a78bfa" />}

        {/* Scroll anchor */}
        <div id="chat-bottom" />
      </div>

      {/* ── UNREAD BADGE ────────────────────────── */}
      {!isAtBottom && unreadCount > 0 && (
        <button
          onClick={() => { scrollToBottom(true); setUnreadCount(0) }}
          style={{
            position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)',
            padding: '7px 18px', borderRadius: 99,
            background: 'color-mix(in srgb, var(--vg-accent) 20%, transparent)',
            border: '1px solid color-mix(in srgb, var(--vg-accent) 40%, transparent)',
            color: 'var(--vg-accent)', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Inter,sans-serif',
            animation: 'unread-pulse 1.5s ease-in-out infinite',
            backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', gap: 6,
            zIndex: 10,
          }}
        >
          ↓ {unreadCount} yeni mesaj
        </button>
      )}

      {/* ── EMOJI PICKER ────────────────────────── */}
      {showEmojiPad && (
        <div style={{
          position: 'absolute', bottom: 80, left: 16, right: 16,
          background: 'rgba(22,22,32,0.97)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16, padding: '12px',
          display: 'flex', flexWrap: 'wrap', gap: 8,
          zIndex: 20,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
          animation: 'system-msg-in 0.2s ease both',
        }}>
          {EMOJIS.map(e => (
            <button
              key={e}
              className="emoji-btn"
              onClick={() => {
                setInput(prev => prev + e)
                inputRef.current?.focus()
              }}
              style={{
                fontSize: 22, background: 'rgba(255,255,255,0.05)',
                border: 'none', borderRadius: 8, padding: '6px',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >{e}</button>
          ))}
        </div>
      )}

      {/* ── INPUT AREA ──────────────────────────── */}
      <div style={{
        padding: '10px 14px',
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(255,255,255,0.03)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: '4px 4px 4px 14px',
          transition: 'border-color 0.2s ease',
        }}>
          {/* Emoji toggle */}
          <button
            className="emoji-btn"
            onClick={() => setEmojiPad(p => !p)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 20, padding: '8px 4px', flexShrink: 0,
              color: showEmojiPad ? 'var(--vg-accent)' : '#666',
              transition: 'color 0.2s ease, transform 0.15s ease',
            }}
            title="Emoji ekle"
          >😊</button>

          {/* Text input — font-size 16px iOS zoom önleme için zorunlu */}
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`#${roomName.toLowerCase().split(' ')[0]} kanalına yaz...`}
            rows={1}
            style={{
              flex: 1, background: 'none', border: 'none',
              color: '#fff', fontSize: 16, fontFamily: 'Inter,sans-serif',
              resize: 'none', lineHeight: 1.5,
              padding: '8px 0',
              maxHeight: 100,
              transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              scrollbarWidth: 'none',
            }}
          />

          {/* Send button */}
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={!input.trim()}
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: input.trim()
                ? 'linear-gradient(135deg,var(--vg-accent),var(--vg-accent-alt))'
                : 'rgba(255,255,255,0.08)',
              border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
              transition: 'all 0.2s ease',
              boxShadow: input.trim() ? '0 0 14px color-mix(in srgb, var(--vg-accent) 35%, transparent)' : 'none',
            }}
          >
            {input.trim() ? '➤' : '✈️'}
          </button>
        </div>

        {/* Hint */}
        <div style={{ marginTop: 5, fontSize: 10, color: '#383838', textAlign: 'center' }}>
          Enter ile gönder · Shift+Enter satır atla · Çift tıkla tepki ver
        </div>
      </div>
    </div>
  )
}
