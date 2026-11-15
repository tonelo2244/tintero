import { Check, Sparkles, Square, Undo2 } from 'lucide-react'
import type { AiStatus } from '@shared/ai'
import type { ToolAgentJob } from '@/core/ai/useToolAgent'
import { AiPanel } from './AiPanel'
import { AiSetupNotice } from './AiSetupNotice'

interface ToolAgentPanelProps<A> {
  /** "Diapositivas", "Hojas"...: sale en la etiqueta accesible del panel. */
  appLabel: string
  job: ToolAgentJob<A> | null
  setupStatus: AiStatus | null
  model: string | null
  examples: string[]
  onRequestChange(request: string): void
  onPropose(request: string): void
  onApply(): void
  onCancel(): void
  onEdit(): void
  onRetrySetup(): void
  onClose(): void
}

/**
 * Panel del agente con herramientas. Lo importante para el usuario está en el centro: la lista de
 * cambios propuestos en lenguaje llano. Nada se aplica sin pulsar "Aplicar", y se deshace de una vez.
 */
export function ToolAgentPanel<A>(props: ToolAgentPanelProps<A>) {
  const { job, setupStatus, model } = props
  const pendingSetup = setupStatus?.state === 'ready' ? null : setupStatus
  const running = job?.phase === 'running'
  const steps = job?.phase === 'done' ? job.proposal.steps : []

  const footer =
    pendingSetup || !job ? undefined : running ? (
      <button type="button" className="ai-button" onClick={props.onCancel}>
        <Square size={12} /> Detener
      </button>
    ) : job.phase === 'done' ? (
      <>
        {steps.length > 0 && (
          <button type="button" className="ai-button ai-button--primary" onClick={props.onApply}>
            <Check size={14} /> Aplicar {steps.length === 1 ? 'el cambio' : `${steps.length} cambios`}
          </button>
        )}
        <button type="button" className="ai-button" onClick={props.onEdit}>
          Cambiar la petición
        </button>
        <button type="button" className="ai-button" onClick={props.onClose}>
          Descartar
        </button>
      </>
    ) : (
      <button
        type="button"
        className="ai-button ai-button--primary"
        disabled={!job.request.trim()}
        onClick={() => props.onPropose(job.request)}
      >
        <Sparkles size={14} /> Proponer cambios
      </button>
    )

  return (
    <AiPanel
      label={`Asistente de ${props.appLabel}`}
      title={running ? 'Pensando los cambios…' : job?.phase === 'done' ? 'Cambios propuestos' : 'Pedir cambios a la IA'}
      busy={running}
      onClose={props.onClose}
      footer={footer}
      hint={
        model && job?.phase === 'done' && steps.length > 0 ? (
          <>
            <Undo2 size={11} /> Propuesto en tu equipo con {model}. Si aplicas los cambios, se deshacen todos a la vez
            con Ctrl+Z.
          </>
        ) : undefined
      }
    >
      {pendingSetup ? (
        <AiSetupNotice status={pendingSetup} onRetry={props.onRetrySetup} />
      ) : !job ? (
        <p className="ai-panel__message">Listo{model ? `: usaré ${model}` : ''}.</p>
      ) : running ? (
        <p className="ai-panel__message">Pidiendo al modelo que proponga los cambios y comprobándolos…</p>
      ) : job.phase === 'done' ? (
        <>
          {steps.length > 0 ? (
            <ol className="ai-list" aria-label="Cambios propuestos">
              {steps.map((step, index) => (
                <li key={index}>{step.label}</li>
              ))}
            </ol>
          ) : (
            <p className="ai-panel__message">
              {job.proposal.text || 'El modelo no ha propuesto ningún cambio que se pueda hacer.'}
            </p>
          )}
          {job.proposal.problems.length > 0 && (
            <div className="ai-warning">
              Se han descartado{' '}
              {job.proposal.problems.length === 1 ? 'una propuesta' : `${job.proposal.problems.length} propuestas`} que
              no eran válidas:
              <ul className="ai-list">
                {job.proposal.problems.map((problem, index) => (
                  <li key={index}>{problem}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            props.onPropose(job.request)
          }}
        >
          <label className="ai-field-label" htmlFor="ai-agent-request">
            ¿Qué quieres cambiar?
          </label>
          <textarea
            id="ai-agent-request"
            className="ai-field"
            autoFocus
            value={job.request}
            placeholder={props.examples[0]}
            onChange={(event) => props.onRequestChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                props.onPropose(job.request)
              }
            }}
          />
          {job.phase === 'error' && <p className="ai-panel__message is-error">{job.message}</p>}
          <p className="ai-panel__hint" style={{ padding: '6px 0 0' }}>
            Ejemplos: {props.examples.join(' · ')}
          </p>
        </form>
      )}
    </AiPanel>
  )
}
