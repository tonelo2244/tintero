import { ArrowDownToLine, Copy, LoaderCircle, RefreshCw, Replace, Sparkles, Square, X } from 'lucide-react'
import type { AiStatus } from '@shared/ai'
import { AiSetupNotice } from '@/ui/ai/AiSetupNotice'
import { cleanModelText } from '../model/ai/writingActions'
import type { useWritingAssistant } from './useWritingAssistant'

interface AssistantPanelProps {
  assistant: ReturnType<typeof useWritingAssistant>
  /** Si no es null, la IA no está lista y el panel enseña cómo prepararla. */
  setupStatus: AiStatus | null
  model: string | null
  onRetrySetup(): void
  onClose(): void
}

/**
 * Panel flotante del asistente. Solo pinta el estado y llama a las acciones del hook: la lógica
 * de qué texto se manda y cómo se aplica vive en useWritingAssistant y aiTarget.
 */
export function AssistantPanel({ assistant, setupStatus, model, onRetrySetup, onClose }: AssistantPanelProps) {
  const { job, generation, result } = assistant
  // Tras "Comprobar de nuevo" con éxito, el aviso de configuración da paso a un "ya está".
  const pendingSetup = setupStatus?.state === 'ready' ? null : setupStatus
  const justConfigured = setupStatus?.state === 'ready' && !job
  const running = generation.phase === 'running'
  const title = pendingSetup ? 'Asistente' : running ? job?.action.progressLabel : job?.action.label

  return (
    <aside className="ai-panel" aria-label="Asistente de redacción" aria-busy={running}>
      <header className="ai-panel__header">
        {running ? <LoaderCircle size={16} className="ai-spin" /> : <Sparkles size={16} />}
        <span>{title}</span>
        <button
          type="button"
          className="ai-button ai-button--icon ai-panel__close"
          title="Cerrar"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className="ai-panel__body" aria-live="polite">
        {pendingSetup ? (
          <AiSetupNotice status={pendingSetup} onRetry={onRetrySetup} />
        ) : justConfigured ? (
          <p className="ai-panel__message">
            Listo{model ? `: usaré ${model}` : ''}. Selecciona texto y elige una acción del Asistente.
          </p>
        ) : job?.message ? (
          <p className="ai-panel__message">{job.message}</p>
        ) : generation.phase === 'error' ? (
          <p className="ai-panel__message is-error">{generation.message}</p>
        ) : generation.phase === 'running' || generation.phase === 'cancelled' ? (
          <div className={`ai-panel__result ${running ? 'is-streaming' : ''}`}>
            {cleanModelText(generation.text) ||
              (running ? 'Pensando… (la primera vez tarda más: el modelo se carga en memoria)' : '')}
          </div>
        ) : generation.phase === 'done' ? (
          <div className="ai-panel__result">{result || 'El modelo no devolvió texto.'}</div>
        ) : null}
      </div>
      {!pendingSetup && job?.target && <PanelActions assistant={assistant} />}
      {!pendingSetup && model && job?.target && (
        <div className="ai-panel__hint">Generado en tu equipo con {model}. Revísalo antes de aplicarlo.</div>
      )}
    </aside>
  )
}

function PanelActions({ assistant }: { assistant: AssistantPanelProps['assistant'] }) {
  const { job, generation, result } = assistant
  if (!job) return null

  if (generation.phase === 'running') {
    return (
      <footer className="ai-panel__footer">
        <button type="button" className="ai-button" onClick={assistant.cancel}>
          <Square size={12} /> Detener
        </button>
      </footer>
    )
  }
  if (generation.phase !== 'done' || !result) {
    return (
      <footer className="ai-panel__footer">
        <button type="button" className="ai-button" onClick={assistant.retry}>
          <RefreshCw size={14} /> Reintentar
        </button>
      </footer>
    )
  }

  const replace = (
    <button
      key="replace"
      type="button"
      className={`ai-button ${job.action.placement === 'replace' ? 'ai-button--primary' : ''}`}
      onClick={() => assistant.apply('replace')}
      // Sustituir el documento entero por un resumen no tiene sentido: solo se ofrece con selección.
      disabled={job.target?.wholeDocument}
    >
      <Replace size={14} /> Reemplazar
    </button>
  )
  const insert = (
    <button
      key="insert"
      type="button"
      className={`ai-button ${job.action.placement === 'insertBelow' ? 'ai-button--primary' : ''}`}
      onClick={() => assistant.apply('insertBelow')}
    >
      <ArrowDownToLine size={14} /> Insertar debajo
    </button>
  )
  return (
    <footer className="ai-panel__footer">
      {job.action.placement === 'replace' ? [replace, insert] : [insert, replace]}
      <button type="button" className="ai-button" onClick={() => void navigator.clipboard.writeText(result)}>
        <Copy size={14} /> Copiar
      </button>
      <button type="button" className="ai-button" onClick={assistant.retry}>
        <RefreshCw size={14} /> Otra versión
      </button>
    </footer>
  )
}
