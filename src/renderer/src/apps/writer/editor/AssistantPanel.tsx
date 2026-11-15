import { ArrowDownToLine, Copy, RefreshCw, Replace, Square } from 'lucide-react'
import type { AiStatus } from '@shared/ai'
import { AiPanel } from '@/ui/ai/AiPanel'
import { AiSetupNotice } from '@/ui/ai/AiSetupNotice'
import { markedToPlain } from '../model/ai/inlineMarks'
import { cleanModelText } from '../model/ai/writingActions'
import { MarkedPreview } from './MarkedPreview'
import type { useWritingAssistant } from './useWritingAssistant'

type WritingAssistant = ReturnType<typeof useWritingAssistant>

interface AssistantPanelProps {
  assistant: WritingAssistant
  /** Si no es null, el panel se abrió para enseñar cómo preparar la IA. */
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
  const pendingSetup = setupStatus?.state === 'ready' ? null : setupStatus
  const running = generation.phase === 'running'
  const title = pendingSetup || !job ? 'Asistente' : running ? job.action.progressLabel : job.action.label
  const showJob = !pendingSetup && job?.target

  return (
    <AiPanel
      label="Asistente de redacción"
      title={title}
      busy={running}
      onClose={onClose}
      footer={showJob ? <PanelActions assistant={assistant} /> : undefined}
      hint={showJob && model ? `Generado en tu equipo con ${model}. Revísalo antes de aplicarlo.` : undefined}
    >
      {pendingSetup ? (
        <AiSetupNotice status={pendingSetup} onRetry={onRetrySetup} />
      ) : !job ? (
        // Tras "Comprobar de nuevo" con éxito.
        <p className="ai-panel__message">
          Listo{model ? `: usaré ${model}` : ''}. Selecciona texto y elige una acción del Asistente.
        </p>
      ) : job.message ? (
        <p className="ai-panel__message">{job.message}</p>
      ) : generation.phase === 'error' ? (
        <p className="ai-panel__message is-error">{generation.message}</p>
      ) : generation.phase === 'running' || generation.phase === 'cancelled' ? (
        <div className={`ai-panel__result ${running ? 'is-streaming' : ''}`}>
          {cleanModelText(generation.text) ? (
            <MarkedPreview text={cleanModelText(generation.text)} />
          ) : running ? (
            (generation.phase === 'running' && generation.progress) ||
            'Pensando… (la primera vez tarda más: el modelo se carga en memoria)'
          ) : (
            ''
          )}
        </div>
      ) : generation.phase === 'done' ? (
        <div className="ai-panel__result">
          {result ? <MarkedPreview text={result} /> : 'El modelo no devolvió texto.'}
        </div>
      ) : null}
      {showJob && job.target?.formatLost && generation.phase === 'done' && (
        <p className="ai-warning">Parte del formato de la selección (colores, resaltado o enlaces) no se conservará.</p>
      )}
    </AiPanel>
  )
}

function PanelActions({ assistant }: { assistant: WritingAssistant }) {
  const { job, generation, result } = assistant
  if (!job) return null

  if (generation.phase === 'running') {
    return (
      <button type="button" className="ai-button" onClick={assistant.cancel}>
        <Square size={12} /> Detener
      </button>
    )
  }
  if (generation.phase !== 'done' || !result) {
    return (
      <button type="button" className="ai-button" onClick={assistant.retry}>
        <RefreshCw size={14} /> Reintentar
      </button>
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
    <>
      {job.action.placement === 'replace' ? [replace, insert] : [insert, replace]}
      <button
        type="button"
        className="ai-button"
        onClick={() => void navigator.clipboard.writeText(markedToPlain(result))}
      >
        <Copy size={14} /> Copiar
      </button>
      <button type="button" className="ai-button" onClick={assistant.retry}>
        <RefreshCw size={14} /> Otra versión
      </button>
    </>
  )
}
