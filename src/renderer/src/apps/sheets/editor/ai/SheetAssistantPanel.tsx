import { Copy, CornerDownLeft, RefreshCw, Sparkles, Square } from 'lucide-react'
import type { AiStatus } from '@shared/ai'
import { AiPanel } from '@/ui/ai/AiPanel'
import { AiSetupNotice } from '@/ui/ai/AiSetupNotice'
import { cleanModelText } from '@/apps/writer/model/ai/writingActions'
import { formatCellValue } from '../../model/format'
import type { FormulaJob, SheetAssistant } from './useSheetAssistant'

interface SheetAssistantPanelProps {
  assistant: SheetAssistant
  setupStatus: AiStatus | null
  model: string | null
  /** La celda destino ya tiene contenido: se avisa de que se sustituirá. */
  targetHasContent: boolean
  onRetrySetup(): void
  onClose(): void
}

const EXAMPLES = ['Suma la columna B si A es mayor que 10', 'Media de las ventas', 'Cuántas filas dicen «Pendiente»']

export function SheetAssistantPanel(props: SheetAssistantPanelProps) {
  const { assistant, setupStatus, model, onRetrySetup, onClose } = props
  const { job, generation } = assistant
  const pendingSetup = setupStatus?.state === 'ready' ? null : setupStatus
  const running = generation.phase === 'running' || (job?.kind === 'formula' && job.job.phase === 'running')

  const title = pendingSetup
    ? 'Asistente'
    : job?.kind === 'formula'
      ? `Fórmula para ${job.target}`
      : job?.kind === 'explain'
        ? `Qué hace ${job.address}`
        : job?.kind === 'analyze'
          ? `Análisis de ${job.range}`
          : 'Asistente'

  return (
    <AiPanel
      label="Asistente de hojas de cálculo"
      title={title}
      busy={running}
      onClose={onClose}
      footer={pendingSetup || !job || job.kind === 'message' ? undefined : <Footer {...props} />}
      hint={
        model && job && job.kind !== 'message'
          ? `Generado en tu equipo con ${model}. Revísalo antes de usarlo.`
          : undefined
      }
    >
      {pendingSetup ? (
        <AiSetupNotice status={pendingSetup} onRetry={onRetrySetup} />
      ) : !job ? (
        <p className="ai-panel__message">Listo{model ? `: usaré ${model}` : ''}. Elige una acción del Asistente.</p>
      ) : job.kind === 'message' ? (
        <p className="ai-panel__message">{job.text}</p>
      ) : job.kind === 'formula' ? (
        <FormulaBody
          job={job.job}
          target={job.target}
          targetHasContent={props.targetHasContent}
          assistant={assistant}
        />
      ) : (
        <TextBody assistant={assistant} formula={job.kind === 'explain' ? job.formula : null} />
      )}
    </AiPanel>
  )
}

function FormulaBody({
  job,
  target,
  targetHasContent,
  assistant
}: {
  job: FormulaJob
  target: string
  targetHasContent: boolean
  assistant: SheetAssistant
}) {
  const request = job.request
  if (job.phase === 'running') {
    return <p className="ai-panel__message">Escribiendo y comprobando la fórmula…</p>
  }
  if (job.phase === 'done') {
    const { proposal } = job
    const isError = typeof proposal.preview === 'object' && proposal.preview !== null
    return (
      <>
        <code className="ai-code" aria-label="Fórmula propuesta">
          {proposal.localized}
        </code>
        {proposal.explanation && <p className="ai-panel__message">{proposal.explanation}</p>}
        <p className="ai-panel__message">
          Resultado en {target}: <strong>{formatCellValue(proposal.preview) || '(vacío)'}</strong>
        </p>
        {isError && <p className="ai-warning">La fórmula es válida pero ahora mismo da un error con estos datos.</p>}
        {targetHasContent && <p className="ai-warning">{target} ya tiene contenido: se sustituirá.</p>}
      </>
    )
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void assistant.proposeFormula(request)
      }}
    >
      <label className="ai-field-label" htmlFor="ai-formula-request">
        ¿Qué quieres calcular en {target}?
      </label>
      <textarea
        id="ai-formula-request"
        className="ai-field"
        autoFocus
        value={request}
        placeholder={EXAMPLES[0]}
        onChange={(event) => assistant.setFormulaRequest(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void assistant.proposeFormula(request)
          }
        }}
      />
      {job.phase === 'error' && <p className="ai-panel__message is-error">{job.message}</p>}
      <p className="ai-panel__hint" style={{ padding: '6px 0 0' }}>
        Ejemplos: {EXAMPLES.join(' · ')}
      </p>
    </form>
  )
}

function TextBody({ assistant, formula }: { assistant: SheetAssistant; formula: string | null }) {
  const { generation, ungrounded } = assistant
  const text = generation.phase === 'error' ? '' : cleanModelText('text' in generation ? generation.text : '')
  return (
    <>
      {formula && <code className="ai-code">{formula}</code>}
      {generation.phase === 'error' ? (
        <p className="ai-panel__message is-error">{generation.message}</p>
      ) : (
        <div className={`ai-panel__result ${generation.phase === 'running' ? 'is-streaming' : ''}`}>
          {text ||
            (generation.phase === 'running'
              ? 'Pensando… (la primera vez tarda más: el modelo se carga en memoria)'
              : '')}
        </div>
      )}
      {ungrounded.length > 0 && (
        <p className="ai-warning">
          Ojo: {ungrounded.map((value) => value.toLocaleString('es-ES')).join(', ')} no{' '}
          {ungrounded.length === 1 ? 'sale' : 'salen'} de los datos calculados. Compruébalo antes de usar el texto.
        </p>
      )}
    </>
  )
}

function Footer({ assistant, targetHasContent }: SheetAssistantPanelProps) {
  const { job, generation } = assistant
  if (!job || job.kind === 'message') return null

  if (job.kind === 'formula') {
    const { phase } = job.job
    if (phase === 'running') {
      return (
        <button type="button" className="ai-button" onClick={assistant.cancel}>
          <Square size={12} /> Detener
        </button>
      )
    }
    if (phase === 'done') {
      return (
        <>
          <button type="button" className="ai-button ai-button--primary" onClick={assistant.insertFormula}>
            <CornerDownLeft size={14} /> {targetHasContent ? 'Sustituir' : 'Insertar'} en {job.target}
          </button>
          <button type="button" className="ai-button" onClick={assistant.retry}>
            <RefreshCw size={14} /> Otra versión
          </button>
          <button type="button" className="ai-button" onClick={assistant.openFormula}>
            Cambiar la petición
          </button>
        </>
      )
    }
    return (
      <button
        type="button"
        className="ai-button ai-button--primary"
        disabled={!job.job.request.trim()}
        onClick={() => void assistant.proposeFormula(job.job.request)}
      >
        <Sparkles size={14} /> Proponer fórmula
      </button>
    )
  }

  if (generation.phase === 'running') {
    return (
      <button type="button" className="ai-button" onClick={assistant.cancel}>
        <Square size={12} /> Detener
      </button>
    )
  }
  const text = generation.phase === 'done' ? cleanModelText(generation.text) : ''
  return (
    <>
      {text && (
        <button type="button" className="ai-button" onClick={() => void navigator.clipboard.writeText(text)}>
          <Copy size={14} /> Copiar
        </button>
      )}
      <button type="button" className="ai-button" onClick={assistant.retry}>
        <RefreshCw size={14} /> {text ? 'Otra versión' : 'Reintentar'}
      </button>
    </>
  )
}
