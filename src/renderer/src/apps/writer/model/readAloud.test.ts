import { describe, expect, it } from 'vitest'
import { ReadAloudPlayer, splitSentences, type ReadAloudState, type SpeechPort } from './readAloud'

/** Motor de voz de mentira: apunta lo que se le pide y deja terminar la frase a mano. */
function fakeSpeech() {
  const spoken: string[] = []
  const calls: string[] = []
  let finish: (() => void) | null = null
  const port: SpeechPort = {
    speak: (text, _options, events) => {
      spoken.push(text)
      finish = events.onEnd
    },
    cancel: () => calls.push('cancel'),
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume')
  }
  return { port, spoken, calls, end: () => finish?.() }
}

describe('leer en voz alta', () => {
  it('trocea en frases con su posición, respetando abreviaturas y signos de apertura', () => {
    const text = '¿Vienes? El Sr. García llega a las 5. ¡Genial!  '
    const sentences = splitSentences(text)
    expect(sentences.map((sentence) => sentence.text)).toEqual(['¿Vienes?', 'El Sr. García llega a las 5.', '¡Genial!'])
    for (const sentence of sentences) expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text)
  })

  it('lee frase a frase y avisa de cuál toca para resaltarla', () => {
    const speech = fakeSpeech()
    const states: ReadAloudState[] = []
    const player = new ReadAloudPlayer(speech.port, splitSentences('Uno. Dos. Tres.'), (state) => states.push(state))
    player.play()
    speech.end()
    speech.end()
    expect(speech.spoken).toEqual(['Uno.', 'Dos.', 'Tres.'])
    speech.end()
    expect(player.state.phase).toBe('idle')
    expect(states.filter((state) => state.phase === 'playing').map((state) => state.current?.text)).toEqual([
      'Uno.',
      'Dos.',
      'Tres.'
    ])
  })

  it('pausa, sigue y salta de frase sin que el fin de la frase cortada avance dos veces', () => {
    const speech = fakeSpeech()
    const player = new ReadAloudPlayer(speech.port, splitSentences('Uno. Dos. Tres.'), () => {})
    player.play()
    player.pause()
    player.play()
    expect(speech.calls).toContain('pause')
    expect(speech.calls).toContain('resume')
    const endOfFirst = speech.end
    player.next()
    expect(player.state.current?.text).toBe('Dos.')
    endOfFirst() // el motor avisa tarde del fin de "Uno.": ya es la frase "Dos."
    expect(player.state.current?.text).toBe('Tres.')
    player.previous()
    expect(player.state.current?.text).toBe('Dos.')
    player.stop()
    expect(player.state).toEqual({ phase: 'idle', index: 1, current: null })
  })
})
