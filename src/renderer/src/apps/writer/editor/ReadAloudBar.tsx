import { Pause, Play, SkipBack, SkipForward, Square, Volume2, X } from 'lucide-react'
import type { ReadAloud } from './useReadAloud'

const RATES = [0.75, 1, 1.25, 1.5, 2]

/** Los mandos de Revisar > Leer en voz alta, flotando sobre el documento como en Word. */
export function ReadAloudBar({ readAloud }: { readAloud: ReadAloud }) {
  const { state, voices } = readAloud
  const playing = state.phase === 'playing'
  return (
    <div className="writer-read-aloud-bar" role="toolbar" aria-label="Leer en voz alta">
      <Volume2 size={16} aria-hidden />
      <button type="button" title="Frase anterior" aria-label="Frase anterior" onClick={readAloud.previous}>
        <SkipBack size={16} />
      </button>
      <button
        type="button"
        title={playing ? 'Pausa' : 'Leer'}
        aria-label={playing ? 'Pausa' : 'Leer'}
        onClick={readAloud.playPause}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button type="button" title="Frase siguiente" aria-label="Frase siguiente" onClick={readAloud.next}>
        <SkipForward size={16} />
      </button>
      <button type="button" title="Parar" aria-label="Parar" onClick={readAloud.stop}>
        <Square size={14} />
      </button>
      <select
        aria-label="Velocidad de lectura"
        value={readAloud.rate}
        onChange={(event) => readAloud.setRate(Number(event.target.value))}
      >
        {RATES.map((rate) => (
          <option key={rate} value={rate}>
            {String(rate).replace('.', ',')}x
          </option>
        ))}
      </select>
      {voices.length > 0 ? (
        <select
          aria-label="Voz"
          value={readAloud.voice ?? ''}
          onChange={(event) => readAloud.setVoice(event.target.value || null)}
        >
          <option value="">Voz del sistema</option>
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="writer-read-aloud-bar__hint">Sin voces instaladas en el sistema</span>
      )}
      <button type="button" title="Cerrar" aria-label="Cerrar lectura en voz alta" onClick={readAloud.close}>
        <X size={16} />
      </button>
    </div>
  )
}
