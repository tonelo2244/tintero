import { Presentation, RefreshCw, Square } from 'lucide-react'
import { AiPanel } from '@/ui/ai/AiPanel'
import type { PresentationJob } from './usePresentationFromDocument'

interface PresentationPanelProps {
  job: PresentationJob
  isDirty: boolean
  model: string | null
  onOpen(): void
  onRetry(): void
  onCancel(): void
  onClose(): void
}

export function PresentationPanel({ job, isDirty, model, onOpen, onRetry, onCancel, onClose }: PresentationPanelProps) {
  const running = job.phase === 'running'
  const title =
    job.phase === 'running'
      ? 'Creando presentación…'
      : job.phase === 'done'
        ? 'Presentación lista'
        : 'Crear presentación'

  const footer =
    job.phase === 'running' ? (
      <button type="button" className="ai-button" onClick={onCancel}>
        <Square size={12} /> Detener
      </button>
    ) : job.phase === 'done' ? (
      <>
        <button type="button" className="ai-button ai-button--primary" onClick={onOpen}>
          <Presentation size={14} /> {isDirty ? 'Guardar y abrir en Diapositivas' : 'Abrir en Diapositivas'}
        </button>
        <button type="button" className="ai-button" onClick={onRetry}>
          <RefreshCw size={14} /> Otra versión
        </button>
      </>
    ) : (
      <button type="button" className="ai-button" onClick={onRetry}>
        <RefreshCw size={14} /> Reintentar
      </button>
    )

  return (
    <AiPanel
      label="Crear presentación"
      title={title}
      busy={running}
      onClose={onClose}
      footer={footer}
      hint={model && job.phase !== 'error' ? `Generado en tu equipo con ${model}.` : undefined}
    >
      {job.phase === 'running' && (
        <p className="ai-panel__message">
          {job.reading
            ? `${job.reading} (el documento es largo: primero se resume por partes)`
            : job.slidesSeen === 0
              ? 'Leyendo el documento… (la primera vez tarda más: el modelo se carga en memoria)'
              : `Escribiendo la diapositiva ${job.slidesSeen}…`}
        </p>
      )}
      {job.phase === 'error' && <p className="ai-panel__message is-error">{job.message}</p>}
      {job.phase === 'done' && (
        <>
          <p className="ai-panel__message">
            <strong>{job.outline.title}</strong> · portada y {job.outline.slides.length} diapositivas:
          </p>
          <ol className="ai-outline">
            {job.outline.slides.map((slide, index) => (
              <li key={index}>{slide.title}</li>
            ))}
          </ol>
        </>
      )}
      {job.phase === 'done' && job.condensed && (
        <p className="ai-panel__message">
          El documento es largo: se ha resumido por partes antes de crear la presentación.
        </p>
      )}
    </AiPanel>
  )
}
