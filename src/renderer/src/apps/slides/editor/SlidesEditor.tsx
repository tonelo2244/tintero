import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { EditorProps } from '@/core/appModule'
import { useAiStatus } from '@/core/ai/useAiStatus'
import { useToolAgent } from '@/core/ai/useToolAgent'
import { initHistory, withHistory } from '@/core/history'
import { platform } from '@/core/platform'
import { EditorLayout } from '@/ui/EditorLayout'
import { ToolAgentPanel } from '@/ui/ai/ToolAgentPanel'
import { buildSlideAgentRequest, interpretSlideCalls } from '../model/ai/slideTools'
import { SLIDES_ACCENT } from '../constants'
import { presentationReducer, type PresentationAction } from '../model/presentationReducer'
import type { Presentation } from '../model/types'
import { NotesPane } from './NotesPane'
import { SlideCanvas } from './SlideCanvas'
import { SlidePanel } from './SlidePanel'
import { Slideshow } from './Slideshow'
import { SLIDES_TABS, SlidesRibbon, type SlidesTabId } from './SlidesRibbon'
import { SlidesAssistantTab } from './SlidesAssistantTab'
import { SlideView } from './SlideView'
import { useSlideCommands } from './useSlideCommands'

const historyReducer = withHistory(presentationReducer)

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function SlidesEditor({ initialContent, session, onChange }: EditorProps<Presentation>) {
  const [history, dispatch] = useReducer(historyReducer, initialContent, initHistory)
  const presentation = history.present

  const [tab, setTab] = useState<SlidesTabId>('home')
  const [selectedSlideId, setSelectedSlideId] = useState(initialContent.slides[0].id)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [editingElementId, setEditingElementId] = useState<string | null>(null)
  const [textEditor, setTextEditor] = useState<Editor | null>(null)
  const [slideshowStart, setSlideshowStart] = useState<number | null>(null)
  const lastSlideIndex = useRef(0)

  // Si la diapositiva seleccionada desaparece (deshacer, eliminar), caemos a la más cercana.
  const foundIndex = presentation.slides.findIndex((slide) => slide.id === selectedSlideId)
  const currentIndex = foundIndex >= 0 ? foundIndex : Math.min(lastSlideIndex.current, presentation.slides.length - 1)
  lastSlideIndex.current = currentIndex
  const currentSlide = presentation.slides[currentIndex]
  const selectedElement = currentSlide.elements.find((element) => element.id === selectedElementId) ?? null

  // Avisar al shell de cada cambio (salvo el estado inicial) para marcar "sin guardar".
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    onChange(presentation)
  }, [presentation, onChange])

  const apply = useCallback(
    (action: PresentationAction, coalesceKey?: string) => dispatch({ type: 'history/apply', action, coalesceKey }),
    []
  )

  // ---------- Asistente: cambios con herramientas ----------
  const ai = useAiStatus()
  const presentationRef = useRef(presentation)
  presentationRef.current = presentation
  const agent = useToolAgent<Presentation, PresentationAction>({
    getState: () => presentationRef.current,
    buildRequest: buildSlideAgentRequest,
    interpret: interpretSlideCalls,
    applyActions: (actions) => {
      setEditingElementId(null)
      dispatch({ type: 'history/applyBatch', actions })
    }
  })
  const [agentPanel, setAgentPanel] = useState<'closed' | 'setup' | 'open'>('closed')
  const openAgent = async () => {
    setEditingElementId(null)
    const status = ai.status?.state === 'ready' ? ai.status : await ai.refresh()
    setAgentPanel(status.state === 'ready' ? 'open' : 'setup')
    if (status.state === 'ready') agent.open()
  }
  const closeAgent = () => {
    agent.close()
    setAgentPanel('closed')
  }

  const selectSlide = useCallback((id: string) => {
    setSelectedSlideId(id)
    setSelectedElementId(null)
    setEditingElementId(null)
  }, [])

  const commands = useSlideCommands({
    presentation,
    currentSlide,
    selectedElement,
    apply,
    selectSlide,
    selectElement: setSelectedElementId,
    editElement: setEditingElementId
  })

  const startSlideshow = useCallback(
    (fromStart: boolean) => setSlideshowStart(fromStart ? 0 : currentIndex),
    [currentIndex]
  )

  // Atajos de teclado del editor de presentaciones.
  useEffect(() => {
    if (slideshowStart !== null) return
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (event.key === 'F5') {
        event.preventDefault()
        startSlideshow(!event.shiftKey)
        return
      }
      if (isTypingTarget(event.target)) return

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'history/redo' : 'history/undo' })
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        dispatch({ type: 'history/redo' })
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        commands.deleteSelectedElement()
      } else if (event.key === 'Escape') {
        setSelectedElementId(null)
      } else if (event.key === 'Enter' && selectedElement?.type === 'text') {
        event.preventDefault()
        setEditingElementId(selectedElement.id)
      } else if (event.key.startsWith('Arrow')) {
        const step = event.shiftKey ? 10 : 1
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
          event.key
        ]
        if (!delta) return
        event.preventDefault()
        if (selectedElement) {
          commands.nudgeSelectedElement(delta[0], delta[1])
        } else {
          const next = presentation.slides[currentIndex + Math.sign(delta[0] + delta[1])]
          if (next) selectSlide(next.id)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commands, currentIndex, presentation.slides, selectSlide, selectedElement, slideshowStart, startSlideshow])

  const exitSlideshow = useCallback(
    (lastIndex: number) => {
      setSlideshowStart(null)
      const slide = presentation.slides[lastIndex]
      if (slide) selectSlide(slide.id)
    },
    [presentation.slides, selectSlide]
  )

  const thumbnails = useMemo(
    () => (
      <SlidePanel
        slides={presentation.slides}
        themeId={presentation.themeId}
        selectedSlideId={currentSlide.id}
        onSelect={selectSlide}
        onMove={commands.moveSlide}
        onDuplicate={commands.duplicateSlide}
        onDelete={commands.deleteSlide}
      />
    ),
    [presentation, currentSlide.id, selectSlide, commands]
  )

  return (
    <>
      <EditorLayout
        accentColor={SLIDES_ACCENT}
        documentName={session.documentName}
        isDirty={session.isDirty}
        onHome={session.goHome}
        onSave={session.save}
        onUndo={() => {
          // Deshacer la presentación cambia el texto por debajo del editor: primero se sale de él.
          setEditingElementId(null)
          dispatch({ type: 'history/undo' })
        }}
        onRedo={() => {
          setEditingElementId(null)
          dispatch({ type: 'history/redo' })
        }}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onPrint={() => void platform.window.print()}
        exportOptions={session.exportOptions}
        tabs={SLIDES_TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id as SlidesTabId)}
        ribbon={
          tab === 'assistant' ? (
            <SlidesAssistantTab
              status={ai.status}
              busy={agent.job?.phase === 'running'}
              onAsk={() => void openAgent()}
              onSelectModel={(model) => void ai.setModel(model)}
            />
          ) : (
            <SlidesRibbon
              tab={tab}
              presentation={presentation}
              currentSlide={currentSlide}
              selectedElement={selectedElement}
              textEditor={editingElementId ? textEditor : null}
              commands={commands}
              onStartSlideshow={startSlideshow}
            />
          )
        }
        statusBar={
          <>
            <span>
              Diapositiva {currentIndex + 1} de {presentation.slides.length}
            </span>
            <span>Español (España)</span>
            <span className="statusbar__spacer" />
            <span className="statusbar__hint">F5 para presentar</span>
          </>
        }
      >
        {agentPanel !== 'closed' && (
          <ToolAgentPanel
            appLabel="Diapositivas"
            job={agent.job}
            setupStatus={agentPanel === 'setup' ? ai.status : null}
            model={ai.status?.state === 'ready' ? ai.status.model : null}
            examples={[
              'Pon en negrita los títulos y añade una diapositiva de conclusiones',
              'Cambia al tema Bosque',
              'Mueve la última diapositiva al principio'
            ]}
            onRequestChange={agent.setRequest}
            onPropose={(request) => void agent.propose(request)}
            onApply={agent.apply}
            onCancel={agent.cancel}
            onEdit={agent.open}
            onRetrySetup={() =>
              void ai.refresh().then((status) => {
                if (status.state !== 'ready') return
                setAgentPanel('open')
                agent.open()
              })
            }
            onClose={closeAgent}
          />
        )}
        <div className="slides-workspace">
          {thumbnails}
          <div className="slides-stage">
            <SlideCanvas
              slide={currentSlide}
              themeId={presentation.themeId}
              selectedElementId={selectedElementId}
              editingElementId={editingElementId}
              onSelectElement={(id) => {
                setSelectedElementId(id)
                if (id !== editingElementId) setEditingElementId(null)
              }}
              onEditElement={setEditingElementId}
              onTextEditorChange={setTextEditor}
              apply={apply}
            />
            {/* Escribir en las notas termina la edición del cuadro de texto. */}
            <div className="slides-notes-slot" onFocusCapture={() => setEditingElementId(null)}>
              <NotesPane notes={currentSlide.notes} onChange={commands.setNotes} />
            </div>
          </div>
        </div>

        {/* Solo visible al imprimir: una diapositiva por página, en horizontal. */}
        <style>{'@page { size: A4 landscape; margin: 1cm; }'}</style>
        <div className="print-only slides-print" aria-hidden>
          {presentation.slides.map((slide) => (
            <div key={slide.id} className="slides-print__page">
              <SlideView slide={slide} themeId={presentation.themeId} width={1040} />
            </div>
          ))}
        </div>
      </EditorLayout>

      {slideshowStart !== null && (
        <Slideshow presentation={presentation} startIndex={slideshowStart} onExit={exitSlideshow} />
      )}
    </>
  )
}
