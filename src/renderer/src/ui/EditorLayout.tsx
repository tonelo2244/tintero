import type { CSSProperties, ReactNode } from 'react'
import { FileDown, Home, Printer, Redo2, Save, Undo2 } from 'lucide-react'

export interface RibbonTab {
  id: string
  label: string
}

interface EditorLayoutProps {
  accentColor: string
  documentName: string
  isDirty: boolean
  onHome(): void
  onSave(): void
  onUndo(): void
  onRedo(): void
  canUndo: boolean
  canRedo: boolean
  onPrint(): void
  onExportPdf(): void
  tabs: RibbonTab[]
  activeTab: string
  onTabChange(id: string): void
  ribbon: ReactNode
  statusBar: ReactNode
  children: ReactNode
}

/**
 * Esqueleto común a todos los editores: barra de título con acceso rápido,
 * pestañas de la cinta, cinta, área de trabajo y barra de estado.
 * Cada app decide QUÉ va en la cinta; el layout decide DÓNDE va.
 */
export function EditorLayout(props: EditorLayoutProps) {
  const { tabs, activeTab, onTabChange } = props

  return (
    <div className="editor-layout" style={{ '--accent': props.accentColor } as CSSProperties}>
      <header className="titlebar">
        <div className="titlebar__quick">
          <QuickButton label="Inicio" onClick={props.onHome}>
            <Home size={16} />
          </QuickButton>
          <QuickButton label="Guardar (Ctrl/Cmd+S)" onClick={props.onSave}>
            <Save size={16} />
          </QuickButton>
          <QuickButton label="Deshacer" onClick={props.onUndo} disabled={!props.canUndo}>
            <Undo2 size={16} />
          </QuickButton>
          <QuickButton label="Rehacer" onClick={props.onRedo} disabled={!props.canRedo}>
            <Redo2 size={16} />
          </QuickButton>
          <QuickButton label="Imprimir (Ctrl/Cmd+P)" onClick={props.onPrint}>
            <Printer size={16} />
          </QuickButton>
          <QuickButton label="Exportar a PDF (Ctrl/Cmd+Shift+E)" onClick={props.onExportPdf}>
            <FileDown size={16} />
          </QuickButton>
        </div>
        <div className="titlebar__title">
          {props.documentName}
          {props.isDirty && (
            <span className="titlebar__dirty" title="Cambios sin guardar">
              {' '}
              •
            </span>
          )}
        </div>
        <nav className="titlebar__tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTab}
              className="ribbon-tab"
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="ribbon" role="toolbar">
        {props.ribbon}
      </div>
      <div className="editor-layout__body">{props.children}</div>
      <footer className="statusbar">{props.statusBar}</footer>
    </div>
  )
}

function QuickButton(props: { label: string; onClick(): void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className="quick-button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  )
}
