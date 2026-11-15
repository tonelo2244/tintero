import type { AiStatus } from '@shared/ai'
import { RibbonGroup, SelectField } from '@/ui/Ribbon'

interface AiModelGroupProps {
  status: AiStatus | null
  busy: boolean
  onSelectModel(model: string): void
}

/** Grupo "Modelo local" de la pestaña Asistente: el mismo en todas las apps. */
export function AiModelGroup({ status, busy, onSelectModel }: AiModelGroupProps) {
  return (
    <RibbonGroup label="Modelo local">
      {status?.state === 'ready' ? (
        <SelectField
          label="Modelo"
          value={status.model}
          width={170}
          disabled={busy}
          options={status.models.map((model) => ({ label: model, value: model }))}
          onChange={onSelectModel}
        />
      ) : (
        <span className="ribbon-note">{status ? 'Ollama no disponible' : 'Comprobando…'}</span>
      )}
    </RibbonGroup>
  )
}
