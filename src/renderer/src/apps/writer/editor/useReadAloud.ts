import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ReadAloudPlayer, type ReadAloudState, type SpeechPort } from '../model/readAloud'
import { documentSentences, type DocumentSentence } from './ReadAloud'

export interface VoiceOption {
  id: string
  label: string
}

const IDLE: ReadAloudState<DocumentSentence> = { phase: 'idle', index: 0, current: null }

/** `speechSynthesis` del sistema (en macOS, las voces españolas de Ajustes > Accesibilidad). */
function browserSpeech(): SpeechPort | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const synth = window.speechSynthesis
  return {
    speak: (text, { rate, voice }, events) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'es-ES'
      utterance.rate = rate
      const chosen = synth.getVoices().find((candidate) => candidate.voiceURI === voice)
      if (chosen) utterance.voice = chosen
      utterance.onend = () => events.onEnd()
      // Al cancelar, Chromium avisa con un error "interrupted": el reproductor ya lo ignora (ticket).
      utterance.onerror = () => events.onEnd()
      synth.speak(utterance)
    },
    cancel: () => synth.cancel(),
    pause: () => synth.pause(),
    resume: () => synth.resume()
  }
}

/** Voces del sistema, las de español primero. Llegan tarde (evento `voiceschanged`). */
function useVoices(): VoiceOption[] {
  const [voices, setVoices] = useState<VoiceOption[]>([])
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const load = () => {
      const all = window.speechSynthesis.getVoices()
      const spanishFirst = [...all].sort((a, b) => Number(b.lang.startsWith('es')) - Number(a.lang.startsWith('es')))
      setVoices(spanishFirst.map((voice) => ({ id: voice.voiceURI, label: `${voice.name} (${voice.lang})` })))
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  return voices
}

/**
 * Leer en voz alta desde el cursor (o solo la selección), resaltando la frase que suena. Si el
 * usuario edita el documento mientras se lee, se para: las frases ya no estarían en su sitio.
 */
export function useReadAloud(editor: Editor | null) {
  const playerRef = useRef<ReadAloudPlayer<DocumentSentence> | null>(null)
  const [state, setState] = useState<ReadAloudState<DocumentSentence>>(IDLE)
  const [open, setOpen] = useState(false)
  const [rate, setRateState] = useState(1)
  const [voice, setVoiceState] = useState<string | null>(null)
  const voices = useVoices()
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const stop = useCallback(() => {
    playerRef.current?.stop()
    playerRef.current = null
    editor?.commands.setReadAloudRange(null)
  }, [editor])

  const start = useCallback(() => {
    const speech = browserSpeech()
    if (!editor || !speech) return
    stop()
    const { doc, selection } = editor.state
    let sentences = selection.empty
      ? documentSentences(doc, selection.from)
      : documentSentences(doc, selection.from, selection.to)
    // Con el cursor al final no queda nada por leer: se empieza desde arriba, como Word.
    if (sentences.length === 0) sentences = documentSentences(doc)
    if (sentences.length === 0) return
    const player = new ReadAloudPlayer(speech, sentences, (next) => {
      setState(next)
      const current = next.current
      editor.commands.setReadAloudRange(current ? { from: current.from, to: current.to } : null)
      if (current) scrollToPosition(editor, current.from)
    })
    player.rate = rate
    player.voice = voice
    playerRef.current = player
    player.play(0)
  }, [editor, rate, voice, stop])

  // Editar mientras se lee: se para (las posiciones de las frases ya no valen).
  useEffect(() => {
    if (!editor) return
    const onUpdate = () => {
      if (playerRef.current) stop()
    }
    editor.on('update', onUpdate)
    return () => {
      editor.off('update', onUpdate)
    }
  }, [editor, stop])

  // Cerrar el editor con la voz sonando: que no siga hablando.
  useEffect(() => () => playerRef.current?.stop(), [])

  return {
    supported,
    open,
    state,
    voices,
    rate,
    voice,
    /** Abre la barra y empieza a leer; si ya estaba abierta, la cierra y para. */
    toggle: () => {
      if (open) {
        stop()
        setOpen(false)
      } else {
        setOpen(true)
        start()
      }
    },
    close: () => {
      stop()
      setOpen(false)
    },
    playPause: () => {
      const player = playerRef.current
      if (!player || player.state.phase === 'idle') start()
      else if (player.state.phase === 'playing') player.pause()
      else player.play()
    },
    next: () => playerRef.current?.next(),
    previous: () => playerRef.current?.previous(),
    stop,
    setRate: (value: number) => {
      setRateState(value)
      playerRef.current?.setRate(value)
    },
    setVoice: (value: string | null) => {
      setVoiceState(value)
      playerRef.current?.setVoice(value)
    }
  }
}

export type ReadAloud = ReturnType<typeof useReadAloud>

/** Lleva a la vista la frase que se lee, sin mover el cursor del usuario. */
function scrollToPosition(editor: Editor, pos: number): void {
  try {
    const { node } = editor.view.domAtPos(pos)
    const element = node instanceof HTMLElement ? node : node.parentElement
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  } catch {
    // La posición puede no tener DOM (documento cambiando): no pasa nada por no desplazar.
  }
}
