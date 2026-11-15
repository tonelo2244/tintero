import { RefreshCw } from 'lucide-react'
import type { AiStatus } from '@shared/ai'
import './ai.css'

const DEFAULT_MODEL = 'gemma4:e4b'

interface AiSetupNoticeProps {
  status: AiStatus
  onRetry(): void
}

/**
 * Qué hacer cuando la IA local no está lista. Mejor explicar los pasos exactos que mostrar
 * "error de conexión": es la diferencia entre una función que se usa y una que se abandona.
 */
export function AiSetupNotice({ status, onRetry }: AiSetupNoticeProps) {
  if (status.state === 'ready') return null
  const model = status.state === 'no-models' ? status.suggestedModel : DEFAULT_MODEL
  return (
    <div className="ai-setup" role="status">
      {status.state === 'unreachable' ? (
        <>
          <p>
            <strong>La IA de Tintero funciona en tu equipo con Ollama</strong>, y no lo encuentro abierto. Tus textos
            nunca salen del ordenador.
          </p>
          <ol>
            <li>
              Descarga e instala Ollama desde{' '}
              <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
                ollama.com/download
              </a>{' '}
              y ábrelo.
            </li>
            <li>
              En el Terminal, descarga un modelo (una sola vez, unos 3–4 GB): <code>ollama pull {model}</code>
            </li>
          </ol>
        </>
      ) : (
        <p>
          Ollama está abierto pero no tiene ningún modelo. En el Terminal: <code>ollama pull {model}</code>
        </p>
      )}
      <button type="button" className="ai-button" onClick={onRetry}>
        <RefreshCw size={14} /> Comprobar de nuevo
      </button>
    </div>
  )
}
