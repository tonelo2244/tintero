import { useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { EditorProps } from '@/core/appModule'
import { platform } from '@/core/platform'
import { EditorLayout } from '@/ui/EditorLayout'
import { WRITER_ACCENT } from '../constants'
import type { WriterContent } from '../model/content'
import { createWriterExtensions } from './extensions'
import { PAGE_HEIGHT_PX, usePageMetrics } from './usePageMetrics'
import { useWriterToolbarState } from './useWriterToolbarState'
import { WriterHomeTab, WriterInsertTab } from './WriterRibbon'
import { WriterTableTab } from './WriterTableTab'
import { WriterStatusBar } from './WriterStatusBar'

const TABS = [
  { id: 'home', label: 'Inicio' },
  { id: 'insert', label: 'Insertar' }
]
/** Pestaña contextual: solo existe mientras el cursor está dentro de una tabla. */
const TABLE_TAB = { id: 'table', label: 'Tabla' }

export function WriterEditor({ initialContent, session, onChange }: EditorProps<WriterContent>) {
  const [activeTab, setActiveTab] = useState('home')
  const [zoom, setZoom] = useState(1)
  const [showMarks, setShowMarks] = useState(false)
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
  const pages = usePageMetrics(editor, pageRef, zoom)

  const inTable = toolbar?.table.active ?? false
  const tabs = inTable ? [...TABS, TABLE_TAB] : TABS
  // Si el cursor sale de la tabla con su pestaña abierta, se vuelve a Inicio (la pestaña desaparece).
  const visibleTab = activeTab === TABLE_TAB.id && !inTable ? 'home' : activeTab

  const renderRibbon = () => {
    if (!editor || !toolbar) return null
    switch (visibleTab) {
      case 'insert':
        return <WriterInsertTab editor={editor} />
      case TABLE_TAB.id:
        return <WriterTableTab editor={editor} state={toolbar} />
      default:
        return (
          <WriterHomeTab
            editor={editor}
            state={toolbar}
            showMarks={showMarks}
            onToggleMarks={() => setShowMarks((value) => !value)}
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
