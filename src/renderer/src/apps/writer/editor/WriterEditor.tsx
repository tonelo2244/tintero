import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { MessagesSquare, Presentation } from 'lucide-react'
import type { EditorProps } from '@/core/appModule'
import { useAiStatus } from '@/core/ai/useAiStatus'
import { platform } from '@/core/platform'
import { EditorLayout } from '@/ui/EditorLayout'
import { RibbonGroup, ToolButton } from '@/ui/Ribbon'
import { presentationFromOutline } from '@/apps/slides/model/outline'
import { WRITER_ACCENT } from '../constants'
import {
  withHeaderFooter,
  withNumberedHeadings,
  withPageSetup,
  withStyles,
  writerParts,
  type WriterContent,
  type WriterParts
} from '../model/content'
import type { CommandContext, WriterUi } from '../model/commands'
import { runCommand } from '../model/commands'
import { applyStyle } from '../model/paragraphStyles'
import { headerFooterText, printPageCss } from '../model/pageLayout'
import { DEFAULT_PAGE_SETUP, pageGeometry, withMargins, type PageSetup } from '../model/pageSetup'
import { DEFAULT_STYLES, stylesCss, type WriterStyle } from '../model/styles'
import { isPaginated, showsRuler, type ReadingTheme, type ViewMode } from '../model/views'
import { zoomForPreset, type ZoomPreset } from '../model/zoom'
import type { WritingActionId } from '../model/ai/writingActions'
import { AskDocumentsPanel } from './AskDocumentsPanel'
import { AssistantPanel } from './AssistantPanel'
import { CommandShortcuts } from './CommandShortcuts'
import { CommentsPanel } from './CommentsPanel'
import { createWriterExtensions } from './extensions'
import { FindReplaceBar, type FindMode } from './FindReplaceBar'
import { HeaderFooterPanel } from './HeaderFooterPanel'
import { NavigationPanel, selectPageStart } from './NavigationPanel'
import { OutlineView } from './OutlineView'
import { PageSetupDialog } from './PageSetupDialog'
import { Pagination } from './Pagination'
import { PresentationPanel } from './PresentationPanel'
import { ReadAloudBar } from './ReadAloudBar'
import { ReadAloudHighlight } from './ReadAloud'
import { ReadingBar } from './ReadingBar'
import { Ruler } from './Ruler'
import { SplitPane } from './SplitPane'
import { StyleDialog } from './StyleDialog'
import { StylesPanel } from './StylesPanel'
import { TabStops } from './TabStops'
import { TabStopsDialog } from './TabStopsDialog'
import { WriterCommandsProvider } from './ribbon/commandContext'
import { HomeTab } from './ribbon/HomeTab'
import { InsertTab } from './ribbon/InsertTab'
import { LayoutTab } from './ribbon/LayoutTab'
import { OutlineTab } from './ribbon/OutlineTab'
import { ReviewTab } from './ribbon/ReviewTab'
import { TableTab } from './ribbon/TableTab'
import { OUTLINE_TAB, TABLE_TAB, visibleTabs } from './ribbon/tabs'
import { ViewTab } from './ribbon/ViewTab'
import { usePageMetrics } from './usePageMetrics'
import { useWriterToolbarState } from './useWriterToolbarState'
import { usePresentationFromDocument } from './usePresentationFromDocument'
import { useAskDocuments } from './useAskDocuments'
import { useReadAloud } from './useReadAloud'
import { useWritingAssistant } from './useWritingAssistant'
import { useWriterComments } from './useWriterComments'
import { WriterAssistantTab } from './WriterAssistantTab'
import { WordCountDialog } from './WordCountDialog'
import { WriterStatusBar } from './WriterStatusBar'

export function WriterEditor({ initialContent, session, onChange }: EditorProps<WriterContent>) {
  const [activeTab, setActiveTab] = useState('home')
  const [zoom, setZoom] = useState(1)
  const [showMarks, setShowMarks] = useState(false)
  const [showRuler, setShowRuler] = useState(true)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [find, setFind] = useState<{ mode: FindMode; request: number } | null>(null)
  // Vista y navegación (fase 14): preferencias de la pantalla, no del documento (no se guardan).
  const [viewMode, setViewModeState] = useState<ViewMode>('print')
  /** Vista a la que vuelve Esc desde el modo lectura. */
  const [viewBeforeReading, setViewBeforeReading] = useState<ViewMode>('print')
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>('light')
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [wordCountOpen, setWordCountOpen] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  /*
   * Encabezado, pie y comentarios no son parte del estado de Tiptap. Se guardan aquí y se mandan
   * junto al cuerpo en cada cambio. El ref evita que `onUpdate` (creado una sola vez) use una copia vieja.
   */
  const [parts, setParts] = useState<WriterParts>(() => writerParts(initialContent))
  const partsRef = useRef(parts)

  /** El contexto de los comandos cambia en cada render; los atajos de teclado leen siempre el último. */
  const commandContextRef = useRef<CommandContext | null>(null)
  // Paginación, tabulaciones y atajos solo hacen falta en pantalla: no cambian el esquema, así que no van en la lista común.
  const extensions = useMemo(
    () => [
      ...createWriterExtensions(),
      Pagination,
      OutlineView,
      ReadAloudHighlight,
      TabStops,
      CommandShortcuts.configure({ getContext: () => commandContextRef.current })
    ],
    []
  )
  const editor = useEditor({
    extensions,
    content: initialContent.doc,
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'writer-content', spellcheck: 'true', lang: 'es' },
      // Al seguir el cursor, que no quede debajo de la regla (pegada arriba del lienzo).
      scrollMargin: { top: 48, bottom: 24, left: 0, right: 0 },
      scrollThreshold: { top: 48, bottom: 24, left: 0, right: 0 }
    },
    onUpdate: ({ editor: current }) => onChange({ ...partsRef.current, doc: current.getJSON() })
  })

  const updateParts = useCallback(
    (change: (current: WriterParts) => WriterParts) => {
      const next = change(partsRef.current)
      partsRef.current = next
      setParts(next)
      if (editor) onChange({ ...next, doc: editor.getJSON() })
    },
    [editor, onChange]
  )
  const comments = useWriterComments(editor, parts.comments ?? [], updateParts)
  const [headerFooterOpen, setHeaderFooterOpen] = useState(false)

  const pageSetup = parts.pageSetup ?? DEFAULT_PAGE_SETUP
  const geometry = useMemo(() => pageGeometry(pageSetup), [pageSetup])
  const setPageSetup = useCallback(
    (next: PageSetup) => updateParts((current) => withPageSetup(current, next)),
    [updateParts]
  )
  // La paginación reparte con el alto útil de la hoja del documento.
  useEffect(() => {
    editor?.commands.setPageGeometry(geometry)
  }, [editor, geometry])

  const styles = parts.styles ?? DEFAULT_STYLES
  const numberedHeadings = parts.numberedHeadings ?? false
  const setStyles = useCallback(
    (next: WriterStyle[]) => updateParts((current) => withStyles(current, next)),
    [updateParts]
  )
  const documentCss = useMemo(() => stylesCss(styles, numberedHeadings), [styles, numberedHeadings])
  // Un estilo más grande cambia la altura de los párrafos: hay que volver a repartir las páginas.
  useEffect(() => {
    editor?.storage.pagination.requestLayout?.()
  }, [editor, documentCss])
  const [stylesPanelOpen, setStylesPanelOpen] = useState(false)
  /** Cuadro de estilo abierto: `null` cerrado; `{ styleId: undefined }` crea uno nuevo. */
  const [styleDialog, setStyleDialog] = useState<{ styleId?: string } | null>(null)
  const [tabStopsOpen, setTabStopsOpen] = useState(false)

  const toolbar = useWriterToolbarState(editor)
  const hasSelection = useEditorState({ editor, selector: ({ editor: current }) => !current?.state.selection.empty })
  const ai = useAiStatus()
  const assistant = useWritingAssistant(editor)
  const presentation = usePresentationFromDocument(editor)
  const getDoc = useCallback(() => editor?.getJSON() ?? null, [editor])
  const askDocuments = useAskDocuments(getDoc, { documentName: session.documentName, filePath: session.filePath })
  /** Panel de IA abierto: ninguno, cómo preparar Ollama, redacción, crear presentación o preguntar. */
  const [aiPanel, setAiPanel] = useState<'closed' | 'setup' | 'writing' | 'presentation' | 'ask'>('closed')
  const pages = usePageMetrics(editor)
  const readAloud = useReadAloud(editor)
  const paginated = isPaginated(viewMode)

  // Cada vista enciende o apaga lo suyo: las hojas, el esquema y si se puede escribir.
  useEffect(() => {
    if (!editor) return
    editor.commands.setPaginationEnabled(isPaginated(viewMode))
    editor.commands.setOutlineView(viewMode === 'outline')
    editor.setEditable(viewMode !== 'read')
  }, [editor, viewMode])

  const setViewMode = (mode: ViewMode) => {
    if (mode === 'read') {
      setViewBeforeReading(viewMode === 'read' ? 'print' : viewMode)
      // Leer es solo leer: fuera paneles y cuadros (taparían la barra del modo lectura).
      closeSidePanels()
      setWordCountOpen(false)
      setFind(null)
    }
    setViewModeState(mode)
    // La pestaña Esquema aparece con su vista y se abre sola, como en Word.
    if (mode === 'outline') setActiveTab(OUTLINE_TAB.id)
  }

  // Esc sale del modo lectura (a la vista de antes).
  useEffect(() => {
    if (viewMode !== 'read') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewModeState(viewBeforeReading)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewMode, viewBeforeReading])

  /** Desplaza el lienzo para que la hoja `page` quede arriba. */
  const scrollToPage = useCallback(
    (page: number) => {
      const canvas = canvasRef.current
      const sheet = pageRef.current
      if (!canvas || !sheet) return
      const sheetTop = sheet.getBoundingClientRect().top - canvas.getBoundingClientRect().top + canvas.scrollTop
      canvas.scrollTop = sheetTop + (page - 1) * geometry.pitch * zoom - 8
    },
    [geometry.pitch, zoom]
  )

  /** Zoom exacto o un preset: las cuentas en model/zoom.ts, las medidas del lienzo aquí. */
  const changeZoom = (target: ZoomPreset | number) => {
    if (typeof target === 'number') return setZoom(target)
    const canvas = canvasRef.current
    if (!canvas) return
    const rulerHeight = showRuler && showsRuler(viewMode) ? 30 : 0
    const next = zoomForPreset(
      target,
      { width: canvas.clientWidth, height: canvas.clientHeight },
      { width: geometry.width, height: geometry.height + rulerHeight },
      24
    )
    setZoom(next)
    // "Una página": la hoja del cursor, entera a la vista.
    if (target === 'onePage') {
      const page = pages.current
      requestAnimationFrame(() => {
        const sheet = pageRef.current
        const canvasNow = canvasRef.current
        if (!sheet || !canvasNow) return
        const sheetTop = sheet.getBoundingClientRect().top - canvasNow.getBoundingClientRect().top + canvasNow.scrollTop
        canvasNow.scrollTop = sheetTop + (page - 1) * geometry.pitch * next - 8
      })
    }
  }

  const openFind = (mode: FindMode) => setFind((previous) => ({ mode, request: (previous?.request ?? 0) + 1 }))

  /** Los paneles laterales van en el mismo sitio: abrir uno cierra los demás. */
  const closeSidePanels = () => {
    comments.setOpen(false)
    setHeaderFooterOpen(false)
    setPageSetupOpen(false)
    setStylesPanelOpen(false)
    setTabStopsOpen(false)
  }

  /** Lo que los comandos pueden pedir a esta pantalla (paneles, buscar, configuración de página). */
  const ui: WriterUi = {
    showMarks,
    toggleMarks: () => setShowMarks((value) => !value),
    openFind,
    addComment: comments.add,
    commentsOpen: comments.open,
    toggleComments: () => {
      const open = comments.open
      closeSidePanels()
      comments.setOpen(!open)
    },
    headerFooterOpen,
    toggleHeaderFooter: () => {
      const open = headerFooterOpen
      closeSidePanels()
      setHeaderFooterOpen(!open)
    },
    pageSetup,
    setPageSetup,
    openPageSetupDialog: () => {
      closeSidePanels()
      setPageSetupOpen(true)
    },
    styles,
    setStyles,
    openStyleDialog: (styleId) => setStyleDialog({ styleId }),
    stylesPanelOpen,
    toggleStylesPanel: () => {
      const open = stylesPanelOpen
      closeSidePanels()
      setStylesPanelOpen(!open)
    },
    numberedHeadings,
    setNumberedHeadings: (numbered) => updateParts((current) => withNumberedHeadings(current, numbered)),
    openTabStopsDialog: () => {
      closeSidePanels()
      setTabStopsOpen(true)
    },
    viewMode,
    setViewMode,
    navigationOpen,
    toggleNavigation: () => setNavigationOpen((open) => !open),
    showRuler,
    toggleRuler: () => setShowRuler((value) => !value),
    zoom,
    setZoom: changeZoom,
    splitOpen,
    toggleSplit: () => setSplitOpen((open) => !open),
    openWordCount: () => {
      closeSidePanels()
      setWordCountOpen(true)
    },
    readAloudOpen: readAloud.open,
    toggleReadAloud: readAloud.toggle
  }
  const commandContext: CommandContext | null = editor ? { editor, ui } : null
  commandContextRef.current = commandContext

  // Edición > Buscar / Reemplazar del menú nativo (Cmd/Ctrl+F y su pareja): los mismos comandos que la cinta.
  useEffect(
    () =>
      platform.onMenuCommand((command) => {
        const context = commandContextRef.current
        if (context && (command === 'find' || command === 'replace')) runCommand(context, command)
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
    askDocuments.close()
    setAiPanel('closed')
  }

  const runWritingAction = async (id: WritingActionId) => {
    if (!(await ensureAiReady())) return
    presentation.close()
    askDocuments.close()
    setFind(null) // los paneles flotan en la misma esquina
    setAiPanel('writing')
    assistant.run(id)
  }

  const createPresentation = async () => {
    if (!(await ensureAiReady())) return
    assistant.close()
    askDocuments.close()
    setFind(null)
    setAiPanel('presentation')
    void presentation.start()
  }

  const openAskDocuments = async () => {
    if (!(await ensureAiReady())) return
    assistant.close()
    presentation.close()
    setFind(null)
    setAiPanel('ask')
    // Cada vez que se abre: lo que no ha cambiado se salta (huella), así que es barato.
    void askDocuments.prepare()
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
  const inOutline = viewMode === 'outline'
  const tabs = visibleTabs(inTable, inOutline)
  // Si una pestaña contextual desaparece (sales de la tabla o del Esquema), se vuelve a otra.
  const visibleTab =
    activeTab === TABLE_TAB.id && !inTable ? 'home' : activeTab === OUTLINE_TAB.id && !inOutline ? 'view' : activeTab

  const renderRibbon = () => {
    if (!editor || !toolbar) return null
    switch (visibleTab) {
      case 'insert':
        return <InsertTab commentCount={comments.count} />
      case 'layout':
        return <LayoutTab state={toolbar} />
      case 'review':
        return <ReviewTab commentCount={comments.count} />
      case 'view':
        return <ViewTab />
      case OUTLINE_TAB.id:
        return <OutlineTab />
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
                <ToolButton large label="Preguntar a mis documentos" onClick={() => void openAskDocuments()}>
                  <MessagesSquare size={22} />
                </ToolButton>
              </RibbonGroup>
            }
          />
        )
      case TABLE_TAB.id:
        return <TableTab />
      default:
        return <HomeTab state={toolbar} />
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
      hideRibbon={viewMode === 'read'}
      ribbon={
        commandContext && <WriterCommandsProvider value={commandContext}>{renderRibbon()}</WriterCommandsProvider>
      }
      statusBar={
        <WriterStatusBar
          currentPage={paginated ? pages.current : null}
          totalPages={paginated ? pages.total : null}
          words={toolbar?.words ?? 0}
          zoom={zoom}
          onZoomChange={setZoom}
          onWordCount={() => commandContext && runCommand(commandContext, 'wordCount')}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
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
      {aiPanel === 'ask' && <AskDocumentsPanel ask={askDocuments} model={readyModel} onClose={closeAiPanel} />}
      {comments.open && (
        <CommentsPanel
          comments={parts.comments ?? []}
          activeId={comments.activeId}
          anchored={comments.anchored}
          onSelect={comments.select}
          onChangeText={comments.changeText}
          onDelete={comments.remove}
          onClose={() => comments.setOpen(false)}
        />
      )}
      {stylesPanelOpen && commandContext && (
        <WriterCommandsProvider value={commandContext}>
          <StylesPanel onClose={() => setStylesPanelOpen(false)} />
        </WriterCommandsProvider>
      )}
      {styleDialog && editor && (
        <StyleDialog
          styles={styles}
          styleId={styleDialog.styleId}
          editor={editor}
          onSave={(nextStyles, created) => {
            setStyles(nextStyles)
            // Como en Word: un estilo nuevo se aplica al párrafo desde el que se creó.
            if (created) applyStyle(editor, created)
          }}
          onClose={() => setStyleDialog(null)}
        />
      )}
      {tabStopsOpen && commandContext && (
        <WriterCommandsProvider value={commandContext}>
          <TabStopsDialog editor={commandContext.editor} onClose={() => setTabStopsOpen(false)} />
        </WriterCommandsProvider>
      )}
      {pageSetupOpen && (
        <PageSetupDialog pageSetup={pageSetup} onApply={setPageSetup} onClose={() => setPageSetupOpen(false)} />
      )}
      {headerFooterOpen && (
        <HeaderFooterPanel
          header={parts.header}
          footer={parts.footer}
          onChange={(part, value) => updateParts((current) => withHeaderFooter(current, part, value))}
          onClose={() => setHeaderFooterOpen(false)}
        />
      )}
      {wordCountOpen && editor && (
        <WordCountDialog
          editor={editor}
          pages={paginated ? pages.total : null}
          onClose={() => setWordCountOpen(false)}
        />
      )}
      {readAloud.open && <ReadAloudBar readAloud={readAloud} />}
      {editor && find && (
        <FindReplaceBar editor={editor} mode={find.mode} openRequest={find.request} onClose={() => setFind(null)} />
      )}
      {viewMode === 'read' && (
        <ReadingBar
          theme={readingTheme}
          onThemeChange={setReadingTheme}
          onExit={() => setViewMode(viewBeforeReading)}
        />
      )}
      <div className="writer-workspace">
        {navigationOpen && editor && viewMode !== 'read' && (
          <NavigationPanel
            editor={editor}
            paginated={paginated}
            geometry={geometry}
            sheetStyle={pageCssVariables(geometry)}
            onGoToPage={(page) => {
              selectPageStart(editor, page)
              scrollToPage(page)
            }}
            onClose={() => setNavigationOpen(false)}
          />
        )}
        <div className="writer-workspace__main">
          <div
            ref={canvasRef}
            className={`writer-canvas writer-canvas--${viewMode} ${viewMode === 'read' ? `writer-reading--${readingTheme}` : ''}`}
            onMouseDown={(event) => {
              // Clic en el fondo gris: llevar el foco al final del documento, como en un procesador de texto.
              if (event.target === event.currentTarget) {
                event.preventDefault()
                editor?.commands.focus('end')
              }
            }}
          >
            <div className="writer-zoom" style={{ zoom }}>
              {showRuler && showsRuler(viewMode) && (
                <Ruler
                  pageSetup={pageSetup}
                  indents={toolbar?.indents ?? null}
                  zoom={zoom}
                  onMarginsChange={(margins) => setPageSetup(withMargins(pageSetup, margins))}
                  tabStops={toolbar?.paragraph.tabStops ?? []}
                  onTabStopsChange={(stops) => commandContext && runCommand(commandContext, 'tabStops', stops)}
                  onIndentsChange={(indents) =>
                    editor?.chain().focus().setIndentCm(indents.left).setFirstLineIndent(indents.firstLine).run()
                  }
                />
              )}
              <div
                ref={pageRef}
                className={`writer-page ${showMarks ? 'show-marks' : ''}`}
                style={{
                  ...(paginated && { minHeight: pages.total * geometry.pitch - geometry.gap }),
                  ...pageCssVariables(geometry)
                }}
              >
                {/* Las hojas se pintan detrás del texto; la extensión Pagination baja cada bloque a la suya. */}
                {paginated && (
                  <div className="writer-sheets" aria-hidden>
                    {Array.from({ length: pages.total }, (_, index) => (
                      <div
                        key={index}
                        className="writer-sheet"
                        style={{ top: index * geometry.pitch, height: geometry.height }}
                      >
                        {parts.header && (
                          <div className={`writer-sheet__header writer-sheet__part--${parts.header.align}`}>
                            {headerFooterText(parts.header, index + 1, pages.total)}
                          </div>
                        )}
                        {parts.footer && (
                          <div className={`writer-sheet__footer writer-sheet__part--${parts.footer.align}`}>
                            {headerFooterText(parts.footer, index + 1, pages.total)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <EditorContent editor={editor} />
              </div>
            </div>
            {/* Impresión y PDF: la hoja del documento con sus márgenes, y encabezado y pie. */}
            <style>{printPageCss(pageSetup, parts.header, parts.footer)}</style>
            {/* El aspecto de cada estilo (Normal, Título 1...) sale de los estilos del documento. */}
            <style>{documentCss}</style>
          </div>
          {splitOpen && editor && (
            <SplitPane editor={editor} sheetStyle={pageCssVariables(geometry)} onClose={() => setSplitOpen(false)} />
          )}
        </div>
      </div>
    </EditorLayout>
  )
}

/**
 * Medidas de la hoja como variables CSS: la hoja, el área de texto, el encabezado y el pie las
 * leen en global.css. Un solo sitio decide las medidas (model/pageSetup.ts); el CSS solo las usa.
 */
function pageCssVariables(geometry: ReturnType<typeof pageGeometry>): CSSProperties {
  const px = (value: number) => `${value.toFixed(2)}px`
  return {
    '--page-width': px(geometry.width),
    '--page-content-height': px(geometry.contentHeight),
    '--margin-top': px(geometry.margins.top),
    '--margin-right': px(geometry.margins.right),
    '--margin-bottom': px(geometry.margins.bottom),
    '--margin-left': px(geometry.margins.left)
  } as CSSProperties
}
