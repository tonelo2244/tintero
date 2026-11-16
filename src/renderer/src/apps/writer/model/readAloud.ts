/**
 * Leer en voz alta: trocear en frases y llevar la cuenta de por cuál va. Puro y sin la API de voz
 * del navegador: el reproductor recibe un `SpeechPort` (en la app, `speechSynthesis`; en las
 * pruebas, uno de mentira). Así la lógica de "siguiente, anterior, pausa" se prueba sin altavoces.
 */

/** Una frase del texto, con su posición (en caracteres) dentro de él. */
export interface Sentence {
  start: number
  end: number
  text: string
}

/**
 * Abreviaturas que terminan en punto sin acabar la frase. `Intl.Segmenter` (ICU) no las conoce en
 * español y cortaría "El Sr. | García...": una frase que acaba en una de ellas se une a la siguiente.
 */
const ABBREVIATIONS =
  /(?:^|[\s(¿¡"«])(?:sr|sra|srta|dr|dra|d|dña|lic|ing|prof|pág|págs|núm|n\.º|art|cap|etc|ej|p\. ej|aprox|tel|av|avda|c\/|uu|ee|vs|vol|ed)\.$/iu

/**
 * Frases de un texto con `Intl.Segmenter`, que sabe de signos de apertura y de puntos en números
 * mejor que una expresión regular, más la lista de abreviaturas. Los espacios del borde no se leen
 * ni se resaltan.
 */
export function splitSentences(text: string, locale = 'es'): Sentence[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' })
  const sentences: Sentence[] = []
  let pendingStart: number | null = null
  for (const { segment, index } of segmenter.segment(text)) {
    const leading = segment.length - segment.trimStart().length
    const trimmed = segment.trim()
    if (!/[\p{L}\p{N}]/u.test(trimmed)) continue
    const start: number = pendingStart ?? index + leading
    const end = index + leading + trimmed.length
    if (ABBREVIATIONS.test(trimmed)) {
      pendingStart = start
      continue
    }
    pendingStart = null
    sentences.push({ start, end, text: text.slice(start, end) })
  }
  if (pendingStart !== null) {
    const rest = text.slice(pendingStart).trimEnd()
    sentences.push({ start: pendingStart, end: pendingStart + rest.length, text: rest })
  }
  return sentences
}

/** Lo mínimo que necesitamos de un motor de voz. */
export interface SpeechPort {
  speak(text: string, options: { rate: number; voice: string | null }, events: { onEnd(): void }): void
  cancel(): void
  pause(): void
  resume(): void
}

export type ReadAloudPhase = 'idle' | 'playing' | 'paused'

export interface ReadAloudState<T extends Sentence = Sentence> {
  phase: ReadAloudPhase
  index: number
  current: T | null
}

/**
 * Reproductor de frases: lee una, al acabar pasa a la siguiente y avisa con `onChange` (para
 * resaltar la frase en el documento). Saltar de frase corta la actual y empieza la otra.
 */
export class ReadAloudPlayer<T extends Sentence = Sentence> {
  private phase: ReadAloudPhase = 'idle'
  private index = 0
  /** Cada frase que se manda al motor lleva un número: si llega el fin de una vieja (tras cancelar), se ignora. */
  private ticket = 0
  rate = 1
  voice: string | null = null

  constructor(
    private readonly speech: SpeechPort,
    private readonly sentences: T[],
    private readonly onChange: (state: ReadAloudState<T>) => void
  ) {}

  get state(): ReadAloudState<T> {
    return {
      phase: this.phase,
      index: this.index,
      current: this.phase === 'idle' ? null : (this.sentences[this.index] ?? null)
    }
  }

  play(from = this.index): void {
    if (this.phase === 'paused' && from === this.index) {
      this.phase = 'playing'
      this.speech.resume()
      this.emit()
      return
    }
    this.speakAt(from)
  }

  pause(): void {
    if (this.phase !== 'playing') return
    this.phase = 'paused'
    this.speech.pause()
    this.emit()
  }

  next(): void {
    if (this.index + 1 < this.sentences.length) this.speakAt(this.index + 1)
  }

  previous(): void {
    this.speakAt(Math.max(0, this.index - 1))
  }

  stop(): void {
    this.ticket++
    this.speech.cancel()
    this.phase = 'idle'
    this.emit()
  }

  /** Cambiar velocidad o voz vuelve a empezar la frase actual con el valor nuevo (como Word). */
  setRate(rate: number): void {
    this.rate = rate
    if (this.phase === 'playing') this.speakAt(this.index)
  }

  setVoice(voice: string | null): void {
    this.voice = voice
    if (this.phase === 'playing') this.speakAt(this.index)
  }

  private speakAt(index: number): void {
    const sentence = this.sentences[index]
    if (!sentence) return this.stop()
    const ticket = ++this.ticket
    this.speech.cancel()
    this.index = index
    this.phase = 'playing'
    this.emit()
    this.speech.speak(
      sentence.text,
      { rate: this.rate, voice: this.voice },
      {
        onEnd: () => {
          if (ticket !== this.ticket) return
          if (index + 1 < this.sentences.length) this.speakAt(index + 1)
          else this.stop()
        }
      }
    )
  }

  private emit(): void {
    this.onChange(this.state)
  }
}
