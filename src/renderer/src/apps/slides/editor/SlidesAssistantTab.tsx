import { WandSparkles } from 'lucide-react'
import type { AiStatus } from '@shared/ai'
import { AiModelGroup } from '@/ui/ai/AiModelGroup'
import { RibbonGroup, ToolButton } from '@/ui/Ribbon'

interface SlidesAssistantTabProps {
  status: AiStatus | null
  busy: boolean
  onAsk(): void
  onSelectModel(model: string): void
}

export function SlidesAssistantTab({ status, busy, onAsk, onSelectModel }: SlidesAssistantTabProps) {
  return (
    <>
      <RibbonGroup label="Editar con IA">
        <ToolButton large label="Pedir cambios" disabled={busy} onClick={onAsk}>
          <WandSparkles size={22} />
        </ToolButton>
      </RibbonGroup>
      <AiModelGroup status={status} busy={busy} onSelectModel={onSelectModel} />
    </>
  )
}
