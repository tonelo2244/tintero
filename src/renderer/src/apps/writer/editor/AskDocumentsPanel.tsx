import { RefreshCw, Search, Square } from 'lucide-react'
import { AiPanel } from '@/ui/ai/AiPanel'
import type { AskDocuments } from './useAskDocuments'

const SUGGESTED_EMBEDDING_MODEL = 'embeddinggemma'

interface AskDocumentsPanelProps {
  ask: AskDocuments
  model: string | null
  onClose(): void
}

/**
 * Panel de "Preguntar a tus documentos". La respuesta siempre va con sus fuentes numeradas:
 * con un modelo pequeño, poder comprobar de dónde sale cada frase vale más que una respuesta bonita.
 */
export function AskDocumentsPanel({ ask, model, onClose }: AskDocumentsPanelProps) {
  const { index, generation, answer, sources } = ask
  const running = index?.phase === 'checking' || index?.phase === 'indexing' || generation.phase === 'running'
  const canAsk = index?.phase === 'ready' && generation.phase !== 'running'

  const footer =
    generation.phase === 'running' ? (
      <button type="button" className="ai-button" onClick={ask.cancel}>
        <Square size={12} /> Detener
      </button>
    ) : index?.phase === 'ready' ? (
      <button
        type="submit"
        form="ai-ask-form"
        className="ai-button ai-button--primary"
        disabled={!canAsk || !ask.question.trim()}
      >
        <Search size={14} /> Preguntar
      </button>
    ) : undefined

  return (
    <AiPanel
      label="Preguntar a mis documentos"
      title={generation.phase === 'running' ? 'Buscando la respuesta…' : 'Preguntar a mis documentos'}
      busy={running}
      onClose={onClose}
      footer={footer}
      hint={
        index?.phase === 'ready'
          ? `${index.sources} ${index.sources === 1 ? 'documento indexado' : 'documentos indexados'} en tu equipo${
              model ? ` · responde ${model}` : ''
            }.`
          : undefined
      }
    >
      {index?.phase === 'checking' && <p className="ai-panel__message">Comprobando la búsqueda local…</p>}
      {index?.phase === 'indexing' && (
        <p className="ai-panel__message">
          Preparando tus documentos ({index.done} de {index.total})… Solo se recalcula lo que ha cambiado.
        </p>
      )}
      {index?.phase === 'error' && <p className="ai-panel__message is-error">{index.message}</p>}
      {index?.phase === 'setup' && (
        <div className="ai-setup" role="status">
          {index.status.state === 'unreachable' ? (
            <p>No encuentro Ollama abierto. Ábrelo y vuelve a intentarlo.</p>
          ) : (
            <p>
              Para buscar en tus documentos hace falta un modelo de <em>embeddings</em> (convierte textos en vectores
              para buscarlos por significado). En el Terminal, una sola vez:{' '}
              <code>ollama pull {index.status.suggestedModel || SUGGESTED_EMBEDDING_MODEL}</code>
            </p>
          )}
          <button type="button" className="ai-button" onClick={() => void ask.prepare()}>
            <RefreshCw size={14} /> Comprobar de nuevo
          </button>
        </div>
      )}

      {index?.phase === 'ready' && (
        <form
          id="ai-ask-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (canAsk) ask.ask(ask.question)
          }}
        >
          <label className="ai-field-label" htmlFor="ai-ask-question">
            ¿Qué quieres saber?
          </label>
          <textarea
            id="ai-ask-question"
            className="ai-field"
            value={ask.question}
            placeholder="¿Qué presupuesto aprobamos para la campaña?"
            onChange={(event) => ask.setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (canAsk) ask.ask(ask.question)
              }
            }}
          />
        </form>
      )}

      {generation.phase === 'running' && (
        <p className="ai-panel__message">{generation.text || generation.progress || 'Buscando…'}</p>
      )}
      {generation.phase === 'error' && <p className="ai-panel__message is-error">{generation.message}</p>}
      {generation.phase === 'cancelled' && <p className="ai-panel__message">Detenido.</p>}
      {answer && (
        <>
          <p className="ai-panel__message" data-testid="ai-answer">
            {answer.text}
          </p>
          {sources.length > 0 && (
            <ol className="ai-sources" aria-label="Fuentes">
              {sources.map((source, position) => (
                <li
                  key={`${source.sourceId}#${source.chunkId}`}
                  className={answer.cited.includes(position + 1) ? 'is-cited' : undefined}
                >
                  <strong>{source.title}</strong> · {source.location}
                </li>
              ))}
            </ol>
          )}
          {answer.invalid.length > 0 && (
            <p className="ai-warning">
              He quitado {answer.invalid.length === 1 ? 'una cita' : 'citas'} a fragmentos que no existen: revisa la
              respuesta con las fuentes.
            </p>
          )}
        </>
      )}
    </AiPanel>
  )
}
