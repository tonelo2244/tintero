import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { Presentation } from 'lucide-react'
import type { EditorProps } from '@/core/appModule'
import { useAiStatus } from '@/core/ai/useAiStatus'
import { platform } from '@/core/platform'
import { EditorLayout } from '@/ui/EditorLayout'
import { RibbonGroup, ToolButton } from '@/ui/Ribbon'
import { presentationFromOutline } from '@/apps/slides/model/outline'
import { WRITER_ACCENT } from '../constants'
import type { WriterContent } from '../model/content'
import type { WritingActionId } from '../model/ai/writingActions'
import { AssistantPanel } from './AssistantPanel'
import { createWriterExtensions } from './extensions'
import { FindReplaceBar, type FindMode } from './FindReplaceBar'
import { PresentationPanel } from './PresentationPanel'
import { PAGE_HEIGHT_PX, usePageMetrics } from './usePageMetrics'
import { useWriterToolbarState } from './useWriterToolbarState'
import { usePresentationFromDocument } from './usePresentationFromDocument'
import { useWritingAssistant } from './useWritingAssistant'
import { WriterAssistantTab } from './WriterAssistantTab'
import { WriterHomeTab, WriterInsertTab } from './WriterRibbon'
import { WriterTableTab } from './WriterTableTab'
import { WriterStatusBar } from './WriterStatusBar'

const TABS = [
  { id: 'home', label: 'Inicio' },
  { id: 'insert', label: 'Insertar' },
  { id: 'assistant', label: 'Asistente' }
]
/** Pestaña contextual: solo existe mientras el cursor está dentro de una tabla. */
const TABLE_TAB = { id: 'table', label: 'Tabla' }

export function WriterEditor({ initialContent, session, onChange }: EditorProps<WriterContent>) {
  const [activeTab, setActiveTab] = useState('home')
  const [zoom, setZoom] = useState(1)
  const [showMarks, setShowMarks] = useState(false)
  const [find, setFind] = useState<{ mode: FindMode; request: number } | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  const extensions = useMemo(createWriterExtensions, [])
  const editor = useEditor({
    extensions,
    content: initialContent.doc,
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'writer-content', spellcheck: 'true', lang: 'es' }
    },
    onUpdate: ({ editor: current }) => onChange({ doc: current.getJSON() })
  })

  const toolbar = useWriterToolbarState(editor)
  const hasSelection = useEditorState({ editor, selector: ({ editor: current }) => !current?.state.selection.empty })
  const ai = useAiStatus()
  const assistant = useWritingAssistant(editor)
  const presentation = usePresentationFromDocument(editor)
  /** Panel de IA abierto: ninguno, cómo preparar Ollama, el asistente de redacción o crear presentación. */
  const [aiPanel, setAiPanel] = useState<'closed' | 'setup' | 'writing' | 'presentation'>('closed')
  const pages = usePageMetrics(editor, pageRef, zoom)

  const openFind = (mode: FindMode) => setFind((previous) => ({ mode, request: (previous?.request ?? 0) + 1 }))

  // Edición > Buscar / Reemplazar del menú nativo (Cmd/Ctrl+F y su pareja).
  useEffect(
    () =>
      platform.onMenuCommand((command) => {
        if (command === 'find' || command === 'replace') openFind(command)
      }),
    []
  )

  /** Comprueba el estado justo antes de usarla: el usuario puede haber abierto Ollama hace un momento. */
  const ensureAiReady = async (): Promise<boolean> => {
    const status = ai.status?.state === 'ready' ? ai.status : await ai.refresh()
    if (status.state === 'ready') return true
    setAiPanel('setup')
    return false
  }

  const closeAiPanel = () => {
    assistant.close()
    presentation.close()
    setAiPanel('closed')
  }

  const runWritingAction = async (id: WritingActionId) => {
    if (!(await ensureAiReady())) return
    presentation.close()
    setFind(null) // los paneles flotan en la misma esquina
    setAiPanel('writing')
    assistant.run(id)
  }

  const createPresentation = async () => {
    if (!(await ensureAiReady())) return
    assistant.close()
    setFind(null)
    setAiPanel('presentation')
    void presentation.start()
  }

  const openPresentation = () => {
    const job = presentation.job
    if (job?.phase !== 'done') return
    // Sustituye a este documento en la ventana; el shell lo guarda antes si tiene cambios.
    session.openNewDocument(
      'slides',
      job.outline.title,
      presentationFromOutline(job.outline),
      'Presentación creada con IA a partir de tu documento. Revísala antes de guardarla.'
    )
  }

  const readyModel = ai.status?.state === 'ready' ? ai.status.model : null
  const inTable = toolbar?.table.active ?? false
  const tabs = inTable ? [...TABS, TABLE_TAB] : TABS
  // Si el cursor sale de la tabla con su pestaña abierta, se vuelve a Inicio (la pestaña desaparece).
  const visibleTab = activeTab === TABLE_TAB.id && !inTable ? 'home' : activeTab

  const renderRibbon = () => {
    if (!editor || !toolbar) return null
    switch (visibleTab) {
      case 'insert':
        return <WriterInsertTab editor={editor} />
      case 'assistant':
        return (
          <WriterAssistantTab
            status={ai.status}
            hasSelection={hasSelection ?? false}
            busy={assistant.generation.phase === 'running' || presentation.job?.phase === 'running'}
            onRun={(id) => void runWritingAction(id)}
            onSelectModel={(model) => void ai.setModel(model)}
            extraGroups={
              <RibbonGroup label="Crear">
                <ToolButton
                  large
                  label="Crear presentación"
                  disabled={presentation.job?.phase === 'running'}
                  onClick={() => void createPresentation()}
                >
                  <Presentation size={22} />
                </ToolButton>
              </RibbonGroup>
            }
          />
        )
      case TABLE_TAB.id:
        return <WriterTableTab editor={editor} state={toolbar} />
      default:
        return (
          <WriterHomeTab
            editor={editor}
            state={toolbar}
            showMarks={showMarks}
            onToggleMarks={() => setShowMarks((value) => !value)}
            onFind={openFind}
          />
        )
    }
  }

  return (
    <EditorLayout
      accentColor={WRITER_ACCENT}
      documentName={session.documentName}
      isDirty={session.isDirty}
      onHome={session.goHome}
      onSave={session.save}
      onUndo={() => editor?.chain().focus().undo().run()}
      onRedo={() => editor?.chain().focus().redo().run()}
      canUndo={toolbar?.canUndo ?? false}
      canRedo={toolbar?.canRedo ?? false}
      onPrint={() => void platform.window.print()}
      exportOptions={session.exportOptions}
      tabs={tabs}
      activeTab={visibleTab}
      onTabChange={setActiveTab}
      ribbon={renderRibbon()}
      statusBar={
        <WriterStatusBar
          currentPage={pages.current}
          totalPages={pages.total}
          words={toolbar?.words ?? 0}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      }
    >
      {(aiPanel === 'setup' || aiPanel === 'writing') && (
        <AssistantPanel
          assistant={assistant}
          setupStatus={aiPanel === 'setup' ? ai.status : null}
          model={readyModel}
          onRetrySetup={() => void ai.refresh()}
          onClose={closeAiPanel}
        />
      )}
      {aiPanel === 'presentation' && presentation.job && (
        <PresentationPanel
          job={presentation.job}
          isDirty={session.isDirty}
          model={readyModel}
          onOpen={openPresentation}
          onRetry={() => void presentation.start()}
          onCancel={presentation.cancel}
          onClose={closeAiPanel}
        />
      )}
      {editor && find && (
        <FindReplaceBar editor={editor} mode={find.mode} openRequest={find.request} onClose={() => setFind(null)} />
      )}
      <div
        className="writer-canvas"
        onMouseDown={(event) => {
          // Clic en el fondo gris: llevar el foco al final del documento, como en un procesador de texto.
          if (event.target === event.currentTarget) {
            event.preventDefault()
            editor?.commands.focus('end')
          }
        }}
      >
        <div className="writer-zoom" style={{ zoom }}>
          <div ref={pageRef} className={`writer-page ${showMarks ? 'show-marks' : ''}`}>
            {Array.from({ length: pages.total - 1 }, (_, index) => (
              <div key={index} className="writer-page__break" style={{ top: (index + 1) * PAGE_HEIGHT_PX }} aria-hidden>
                <span>Página {index + 2}</span>
              </div>
            ))}
            <EditorContent editor={editor} />
          </div>
        </div>
        {/* Impresión y PDF: hoja A4 con los mismos márgenes que la hoja en pantalla. */}
        <style>{'@page { size: A4; margin: 2.5cm; }'}</style>
      </div>
    </EditorLayout>
  )
}
