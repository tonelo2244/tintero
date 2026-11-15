import type { ReactNode } from 'react'
import { Briefcase, ListCollapse, Shrink, SpellCheck, WandSparkles, type LucideIcon } from 'lucide-react'
import type { AiStatus } from '@shared/ai'
import { AiModelGroup } from '@/ui/ai/AiModelGroup'
import { RibbonGroup, RibbonRow, ToolButton } from '@/ui/Ribbon'
import { WRITING_ACTIONS, type WritingActionId } from '../model/ai/writingActions'

const ICONS: Record<WritingActionId, LucideIcon> = {
  proofread: SpellCheck,
  improve: WandSparkles,
  formal: Briefcase,
  shorter: Shrink,
  summarize: ListCollapse
}

const GROUPS: { label: string; actions: WritingActionId[] }[] = [
  { label: 'Revisar', actions: ['proofread', 'improve'] },
  { label: 'Reescribir', actions: ['formal', 'shorter'] },
  { label: 'Resumir', actions: ['summarize'] }
]

interface WriterAssistantTabProps {
  status: AiStatus | null
  hasSelection: boolean
  busy: boolean
  onRun(id: WritingActionId): void
  onSelectModel(model: string): void
  /** Grupos extra que añaden otras funciones (p. ej. "Crear presentación"). */
  extraGroups?: ReactNode
}

/** Pestaña "Asistente" de la cinta: lanza acciones y elige el modelo local. */
export function WriterAssistantTab({
  status,
  hasSelection,
  busy,
  onRun,
  onSelectModel,
  extraGroups
}: WriterAssistantTabProps) {
  return (
    <>
      {GROUPS.map((group) => (
        <RibbonGroup key={group.label} label={group.label}>
          <RibbonRow>
            {group.actions.map((id) => {
              const action = WRITING_ACTIONS.find((candidate) => candidate.id === id)!
              const Icon = ICONS[id]
              const needsSelection = !action.allowsWholeDocument && !hasSelection
              return (
                <ToolButton
                  key={id}
                  large
                  label={action.label}
                  disabled={busy || needsSelection}
                  onClick={() => onRun(id)}
                >
                  <Icon size={22} />
                </ToolButton>
              )
            })}
          </RibbonRow>
        </RibbonGroup>
      ))}
      {extraGroups}
      <AiModelGroup status={status} busy={busy} onSelectModel={onSelectModel} />
    </>
  )
}
