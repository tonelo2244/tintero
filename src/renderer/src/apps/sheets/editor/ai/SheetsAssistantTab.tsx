import { ChartColumn, MessageCircleQuestionMark, SquareFunction } from 'lucide-react'
import type { AiStatus } from '@shared/ai'
import { AiModelGroup } from '@/ui/ai/AiModelGroup'
import { RibbonGroup, RibbonRow, ToolButton } from '@/ui/Ribbon'

interface SheetsAssistantTabProps {
  status: AiStatus | null
  busy: boolean
  activeCellHasFormula: boolean
  onFormula(): void
  onExplain(): void
  onAnalyze(): void
  onSelectModel(model: string): void
}

/** Pestaña "Asistente" de Hojas: fórmulas en lenguaje natural, explicarlas y analizar datos. */
export function SheetsAssistantTab(props: SheetsAssistantTabProps) {
  return (
    <>
      <RibbonGroup label="Fórmulas">
        <RibbonRow>
          <ToolButton large label="Fórmula con IA" disabled={props.busy} onClick={props.onFormula}>
            <SquareFunction size={22} />
          </ToolButton>
          <ToolButton
            large
            label="Explicar fórmula"
            disabled={props.busy || !props.activeCellHasFormula}
            onClick={props.onExplain}
          >
            <MessageCircleQuestionMark size={22} />
          </ToolButton>
        </RibbonRow>
      </RibbonGroup>
      <RibbonGroup label="Datos">
        <ToolButton large label="Analizar datos" disabled={props.busy} onClick={props.onAnalyze}>
          <ChartColumn size={22} />
        </ToolButton>
      </RibbonGroup>
      <AiModelGroup status={props.status} busy={props.busy} onSelectModel={props.onSelectModel} />
    </>
  )
}
