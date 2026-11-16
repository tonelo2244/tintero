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
  withAuthor,
  withHeaderFooter,
  withHyphenation,
  withNumberedHeadings,
  withPageSetup,
  withStyles,
  writerParts,
  type HeaderFooterAlign,
  type WriterContent,
  type WriterParts
} from '../model/content'
import type { CommandContext, WriterDialogId, WriterUi } from '../model/commands'
import { runCommand } from '../model/commands'
import { applyStyle } from '../model/paragraphStyles'
import { headerFooterText, printPageCss } from '../model/pageLayout'
import { DEFAULT_PAGE_SETUP, pageGeometry, withMargins, type PageSetup } from '../model/pageSetup'
import { documentSections, type BlockLike } from '../model/sections'
import {
  headerFooterForPage,
  headerFooterOf,
  VARIANT_LABELS,
  variantForPage,
  withHeaderFooterPart,
  withVariantEnabled,
  type HeaderFooterKind
} from '../model/headerFooter'
import { DEFAULT_STYLES, stylesCss, type WriterStyle } from '../model/styles'
import { isPaginated, showsRuler, type ReadingTheme, type ViewMode } from '../model/views'
import { multiPageLayout, zoomForPreset, type ZoomPreset } from '../model/zoom'
import type { WritingActionId } from '../model/ai/writingActions'
import { AskDocumentsPanel } from './AskDocumentsPanel'
import { AssistantPanel } from './AssistantPanel'
import { CommandShortcuts } from './CommandShortcuts'
import { CommentsPanel } from './CommentsPanel'
import { createWriterExtensions } from './extensions'
import { FindReplaceBar, type FindMode } from './FindReplaceBar'
import { HeaderFooterPanel } from './HeaderFooterPanel'
import { InsertDialogs } from './InsertDialogs'
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
import { HEADER_FOOTER_TAB, OBJECT_TAB_ID, OUTLINE_TAB, TABLE_TAB, visibleTabs } from './ribbon/tabs'
import { ObjectTab } from './ribbon/ObjectTab'
import { selectedObject } from '../model/objectEdits'
import { HeaderFooterTab } from './ribbon/HeaderFooterTab'
import { ViewTab } from './ribbon/ViewTab'
import { usePageMetrics } from './usePageMetrics'
import { useCurrentSection } from './useCurrentSection'
import type { SheetBox } from './Pagination'
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
  /** Hojas por fila: 1 es lo normal; más, "Varias páginas". */
  const [pagesAcrossSetting, setPagesAcross] = useState(1)
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
  /** Encabezado o pie que se edita sobre la hoja (doble clic en el margen superior o inferior). */
  const [headerFooterEditing, setHeaderFooterEditing] = useState<{
    page: number
    kind: HeaderFooterKind
    align: HeaderFooterAlign
  } | null>(null)
  const editingVariant = headerFooterEditing ? variantForPage(parts, headerFooterEditing.page) : null
  const editingValue =
    headerFooterEditing && editingVariant ? headerFooterOf(parts, editingVariant)[headerFooterEditing.kind] : undefined
  /** Cambia el texto de lo que se edita; vacío, lo quita (el archivo no guarda partes vacías). */
  const setEditingText = (text: string, align = editingValue?.align ?? headerFooterEditing?.align ?? 'left') => {
    if (!headerFooterEditing || !editingVariant) return
    const value = text.trim() === '' ? undefined : { text, align }
    updateParts((current) => withHeaderFooterPart(current, editingVariant, headerFooterEditing.kind, value))
  }
  // Volver al texto del documento cierra el encabezado y pie, como en Word.
  useEffect(() => {
    if (!editor || !headerFooterEditing) return
    const close = () => setHeaderFooterEditing(null)
    editor.on('focus', close)
    return () => {
      editor.off('focus', close)
    }
  }, [editor, headerFooterEditing])

  // Los campos Nombre del archivo y Autor leen estos datos, que no están en el texto.
  useEffect(() => {
    editor?.commands.setFieldContext({ fileName: session.documentName, author: parts.author ?? '' })
  }, [editor, session.documentName, parts.author])

  const pageSetup = parts.pageSetup ?? DEFAULT_PAGE_SETUP
  const geometry = useMemo(() => pageGeometry(pageSetup), [pageSetup])
  const setPageSetup = useCallback(
    (next: PageSetup) => updateParts((current) => withPageSetup(current, next)),
    [updateParts]
  )
  // La paginación reparte con la hoja del documento (y la de cada sección, que lee del propio texto).
  useEffect(() => {
    editor?.commands.setPageSetup(pageSetup)
  }, [editor, pageSetup])
  // Disposición cambia la hoja de la sección del cursor: la primera es la del documento.
  const section = useCurrentSection(editor, pageSetup)
  const sectionSetup = section.pageSetup
  const setSectionSetup = useCallback(
    (next: PageSetup) => {
      if (section.breakPos === null) setPageSetup(next)
      else editor?.chain().focus().setSectionPageSetup(section.breakPos, next).run()
    },
    [editor, section.breakPos, setPageSetup]
  )
  /** Hoja de cada sección, para imprimir cada una en su tamaño. */
  const sectionSetups = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return [pageSetup]
      const blocks: BlockLike[] = []
      current.state.doc.forEach((node) => blocks.push({ type: node.type.name, attrs: node.attrs }))
      return documentSections(blocks, pageSetup).setups
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b)
  }) ?? [pageSetup]

  const styles = parts.styles ?? DEFAULT_STYLES
  const numberedHeadings = parts.numberedHeadings ?? false
  const setStyles = useCallback(
    (next: WriterStyle[]) => updateParts((current) => withStyles(current, next)),
    [updateParts]
  )
  const documentCss = useMemo(() => stylesCss(styles, numberedHeadings), [styles, numberedHeadings])
  const hyphenation = parts.hyphenation ?? false
  // Un estilo más grande o partir palabras cambia la altura de los párrafos: hay que volver a repartir.
  useEffect(() => {
    editor?.storage.pagination.requestLayout?.()
  }, [editor, documentCss, hyphenation])
  const [stylesPanelOpen, setStylesPanelOpen] = useState(false)
  /** Cuadro de estilo abierto: `null` cerrado; `{ styleId: undefined }` crea uno nuevo. */
  const [styleDialog, setStyleDialog] = useState<{ styleId?: string } | null>(null)
  const [tabStopsOpen, setTabStopsOpen] = useState(false)
  /** Cuadro de Insertar abierto (vínculo, marcador, símbolo...): uno a la vez. */
  const [insertDialog, setInsertDialog] = useState<WriterDialogId | null>(null)

  const toolbar = useWriterToolbarState(editor)
  /** Imagen, forma, cuadro de texto o gráfico seleccionado: su pestaña contextual (fase 16). */
  const object = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? selectedObject(current) : null),
    equalityFn: (a, b) => a?.pos === b?.pos && a?.node === b?.node
  })
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
  // "Varias páginas" solo existe con hojas; en las otras vistas el texto va seguido.
  const pagesAcross = paginated ? pagesAcrossSetting : 1
  const multiPage = pagesAcross > 1
  /** Ancho de `.writer-page`: el de la hoja más ancha (con secciones horizontales y verticales). */
  const layoutWidth = multiPage ? geometry.width : (pages.layoutWidth ?? geometry.width)
  // En "Varias páginas" las hojas van en filas y todas iguales (con secciones no se ofrece).
  const sheets: SheetBox[] = multiPage
    ? Array.from({ length: pages.total }, (_, index) => ({
        top: Math.floor(index / pagesAcross) * geometry.pitch,
        left: (index % pagesAcross) * (geometry.width + geometry.gap),
        geometry
      }))
    : pages.sheets.length === pages.total
      ? pages.sheets
      : [{ top: 0, left: 0, geometry }]
  const lastSheet = sheets[sheets.length - 1]
  const sheetsHeight = lastSheet.top + lastSheet.geometry.height

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

  /** Desplaza el lienzo para que la hoja `page` quede arriba (en "Varias páginas", su fila). */
  const scrollToPage = useCallback(
    (page: number, zoomNow = zoom, across = pagesAcross) => {
      const canvas = canvasRef.current
      const sheet = pageRef.current
      if (!canvas || !sheet) return
      const sheetTop = sheet.getBoundingClientRect().top - canvas.getBoundingClientRect().top + canvas.scrollTop
      canvas.scrollTop = sheetTop + Math.floor((page - 1) / across) * geometry.pitch * zoomNow - 8
    },
    [geometry.pitch, zoom, pagesAcross]
  )

  /** Zoom exacto o un preset: las cuentas en model/zoom.ts, las medidas del lienzo aquí. */
  const changeZoom = (target: ZoomPreset | number) => {
    if (typeof target === 'number') {
      setPagesAcross(1)
      return setZoom(target)
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const area = { width: canvas.clientWidth, height: canvas.clientHeight }
    if (target === 'multiPage') {
      // Sin regla: con varias hojas por fila no hay un solo margen que enseñar.
      const layout = multiPageLayout(area, geometry, geometry.gap, 24)
      setZoom(layout.zoom)
      setPagesAcross(layout.across)
      const page = pages.current
      requestAnimationFrame(() => scrollToPage(page, layout.zoom, layout.across))
      return
    }
    setPagesAcross(1)
    const rulerHeight = showRuler && showsRuler(viewMode) ? 30 : 0
    const next = zoomForPreset(target, area, { width: geometry.width, height: geometry.height + rulerHeight }, 24)
    setZoom(next)
    // "Una página": la hoja del cursor, entera a la vista.
    if (target === 'onePage') {
      const page = pages.current
      requestAnimationFrame(() => scrollToPage(page, next, 1))
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
    setInsertDialog(null)
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
    headerFooterEditing:
      headerFooterEditing && editingVariant
        ? {
            kind: headerFooterEditing.kind,
            variant: editingVariant,
            align: editingValue?.align ?? headerFooterEditing.align
          }
        : null,
    closeHeaderFooterEditing: () => setHeaderFooterEditing(null),
    insertHeaderFooterToken: (token) => {
      const text = editingValue?.text ?? ''
      setEditingText(`${text}${text && !text.endsWith(' ') ? ' ' : ''}${token}`)
    },
    setHeaderFooterAlign: (align) => {
      if (editingValue) setEditingText(editingValue.text, align)
      else setHeaderFooterEditing((current) => current && { ...current, align })
    },
    differentFirstPage: parts.firstPage !== undefined,
    setDifferentFirstPage: (enabled) => updateParts((current) => withVariantEnabled(current, 'first', enabled)),
    differentEvenPages: parts.evenPages !== undefined,
    setDifferentEvenPages: (enabled) => updateParts((current) => withVariantEnabled(current, 'even', enabled)),
    headerFooterOpen,
    toggleHeaderFooter: () => {
      const open = headerFooterOpen
      closeSidePanels()
      setHeaderFooterOpen(!open)
    },
    pageSetup: sectionSetup,
    setPageSetup: setSectionSetup,
    hasSections: sectionSetups.length > 1,
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
    hyphenation,
    setHyphenation: (enabled) => updateParts((current) => withHyphenation(current, enabled)),
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
    multiPage,
    setZoom: changeZoom,
    splitOpen,
    toggleSplit: () => setSplitOpen((open) => !open),
    openWordCount: () => {
      closeSidePanels()
      setWordCountOpen(true)
    },
    readAloudOpen: readAloud.open,
    toggleReadAloud: readAloud.toggle,
    openDialog: (dialog) => {
      closeSidePanels()
      setInsertDialog(dialog)
    },
    documentAuthor: parts.author ?? '',
    setDocumentAuthor: (author) => updateParts((current) => withAuthor(current, author))
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
  const inHeaderFooter = headerFooterEditing !== null
  const tabs = visibleTabs(inTable, inOutline, inHeaderFooter, object?.type ?? null)
  // Si una pestaña contextual desaparece (sales de la tabla, del Esquema o del encabezado), se vuelve a otra.
  const visibleTab =
    activeTab === TABLE_TAB.id && !inTable
      ? 'home'
      : activeTab === OUTLINE_TAB.id && !inOutline
        ? 'view'
        : activeTab === HEADER_FOOTER_TAB.id && !inHeaderFooter
          ? 'insert'
          : activeTab === OBJECT_TAB_ID && !object
            ? 'insert'
            : activeTab

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
      case HEADER_FOOTER_TAB.id:
        return <HeaderFooterTab />
      case OBJECT_TAB_ID:
        return object ? <ObjectTab object={object} /> : null
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
          onZoomChange={changeZoom}
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
      {insertDialog && editor && (
        <InsertDialogs dialog={insertDialog} editor={editor} ui={ui} onClose={() => setInsertDialog(null)} />
      )}
      {pageSetupOpen && (
        <PageSetupDialog pageSetup={sectionSetup} onApply={setSectionSetup} onClose={() => setPageSetupOpen(false)} />
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
              {showRuler && showsRuler(viewMode) && !multiPage && (
                <Ruler
                  pageSetup={sectionSetup}
                  offset={(layoutWidth - pageGeometry(sectionSetup).width) / 2}
                  indents={toolbar?.indents ?? null}
                  zoom={zoom}
                  onMarginsChange={(margins) => setSectionSetup(withMargins(sectionSetup, margins))}
                  tabStops={toolbar?.paragraph.tabStops ?? []}
                  onTabStopsChange={(stops) => commandContext && runCommand(commandContext, 'tabStops', stops)}
                  // Sin focus(): con las flechas, el foco se queda en la marca de la regla para el paso siguiente.
                  onIndentsChange={(indents) =>
                    editor?.chain().setIndentCm(indents.left).setFirstLineIndent(indents.firstLine).run()
                  }
                />
              )}
              <div
                ref={pageRef}
                className={`writer-page ${showMarks ? 'show-marks' : ''} ${multiPage ? 'writer-page--multi' : ''} ${hyphenation ? 'writer-page--hyphenate' : ''} ${inHeaderFooter ? 'writer-page--header-footer' : ''}`}
                onDoubleClick={(event) => {
                  // Doble clic en el margen superior o inferior de una hoja: editar su encabezado o pie.
                  if (!paginated || multiPage || !pageRef.current) return
                  const box = pageRef.current.getBoundingClientRect()
                  const target = headerFooterAt(
                    sheets,
                    (event.clientX - box.left) / zoom,
                    (event.clientY - box.top) / zoom
                  )
                  if (!target) return
                  event.preventDefault()
                  const current = headerFooterForPage(parts, target.page)[target.kind]
                  setHeaderFooterEditing({
                    ...target,
                    align: current?.align ?? (target.kind === 'header' ? 'left' : 'center')
                  })
                  setActiveTab(HEADER_FOOTER_TAB.id)
                }}
                style={{
                  ...(paginated && { minHeight: sheetsHeight }),
                  ...pageCssVariables(geometry, pagesAcross, layoutWidth)
                }}
              >
                {/* Las hojas se pintan detrás del texto; la extensión Pagination baja cada bloque a la suya. */}
                {paginated && (
                  <div className="writer-sheets" aria-hidden>
                    {sheets.map((sheet, index) => (
                      <div
                        key={index}
                        className="writer-sheet"
                        style={{
                          top: sheet.top,
                          left: sheet.left,
                          width: sheet.geometry.width,
                          height: sheet.geometry.height,
                          ...sheetMarginVariables(sheet.geometry)
                        }}
                      >
                        {(['header', 'footer'] as const).map((kind) => {
                          const part = headerFooterForPage(parts, index + 1)[kind]
                          const editing = headerFooterEditing?.page === index + 1 && headerFooterEditing.kind === kind
                          const align = editing ? (editingValue?.align ?? headerFooterEditing.align) : part?.align
                          const className = `writer-sheet__${kind} writer-sheet__part--${align ?? 'left'}`
                          if (editing) {
                            const label = `${kind === 'header' ? 'Encabezado' : 'Pie de página'}${
                              editingVariant && editingVariant !== 'default'
                                ? ` de ${VARIANT_LABELS[editingVariant]}`
                                : ''
                            }`
                            return (
                              <div key={kind} className={`${className} writer-sheet__editing`}>
                                <span className="writer-sheet__editing-label">{label}</span>
                                <textarea
                                  autoFocus
                                  aria-label={label}
                                  rows={1}
                                  value={editingValue?.text ?? ''}
                                  onChange={(event) => setEditingText(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Escape') {
                                      setHeaderFooterEditing(null)
                                      editor?.commands.focus()
                                    }
                                  }}
                                />
                              </div>
                            )
                          }
                          return part ? (
                            <div key={kind} className={className}>
                              {headerFooterText(part, index + 1, pages.total)}
                            </div>
                          ) : null
                        })}
                      </div>
                    ))}
                  </div>
                )}
                <EditorContent editor={editor} />
              </div>
            </div>
            {/* Impresión y PDF: la hoja del documento con sus márgenes, y encabezado y pie. */}
            <style>
              {printPageCss(sectionSetups, parts.header, parts.footer, {
                first: parts.firstPage,
                even: parts.evenPages
              })}
            </style>
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
function pageCssVariables(
  geometry: ReturnType<typeof pageGeometry>,
  across = 1,
  layoutWidth = geometry.width
): CSSProperties {
  const px = (value: number) => `${value.toFixed(2)}px`
  const { width, gap, margins, contentWidth, contentHeight, pitch } = geometry
  /** Holgura de cada columna en "Varias páginas": el último renglón puede asomar medio píxel. */
  const columnSlack = 8
  /** Con secciones más anchas, la hoja del documento va centrada en `.writer-page`. */
  const inset = across > 1 ? 0 : (layoutWidth - width) / 2
  return {
    '--page-width': px(across > 1 ? across * width + (across - 1) * gap : layoutWidth),
    '--page-content-height': px(contentHeight),
    '--content-width': px(contentWidth),
    '--margin-top': px(margins.top),
    '--margin-right': px(margins.right + inset),
    '--margin-bottom': px(margins.bottom),
    '--margin-left': px(margins.left + inset),
    // "Varias páginas": cada hoja es una columna del texto (ver .writer-page--multi en global.css).
    '--pages-across': String(across),
    '--multi-content-width': px(across * contentWidth + (across - 1) * (margins.left + margins.right + gap)),
    '--multi-column-gap': px(margins.left + margins.right + gap),
    '--multi-column-height': px(contentHeight + columnSlack),
    '--multi-row-gap': px(pitch - contentHeight - columnSlack)
  } as CSSProperties
}

/** Encabezado o pie de la hoja bajo un punto de `.writer-page` (px sin zoom), o null si cae en el texto. */
function headerFooterAt(sheets: SheetBox[], x: number, y: number): { page: number; kind: HeaderFooterKind } | null {
  const index = sheets.findIndex(
    (sheet) =>
      y >= sheet.top &&
      y <= sheet.top + sheet.geometry.height &&
      x >= sheet.left &&
      x <= sheet.left + sheet.geometry.width
  )
  if (index < 0) return null
  const { top, geometry } = sheets[index]
  if (y < top + geometry.margins.top) return { page: index + 1, kind: 'header' }
  if (y > top + geometry.height - geometry.margins.bottom) return { page: index + 1, kind: 'footer' }
  return null
}

/** Márgenes de una hoja concreta: los leen su encabezado y su pie (cada sección tiene los suyos). */
function sheetMarginVariables(geometry: ReturnType<typeof pageGeometry>): CSSProperties {
  const px = (value: number) => `${value.toFixed(2)}px`
  return {
    '--margin-top': px(geometry.margins.top),
    '--margin-right': px(geometry.margins.right),
    '--margin-bottom': px(geometry.margins.bottom),
    '--margin-left': px(geometry.margins.left)
  } as CSSProperties
}
