import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { nextFontSize } from '@/ui/fonts'
import { DEFAULT_FONT_SIZE_PT } from '../constants'
import {
  MARGIN_PRESETS,
  PAPER_SIZES,
  withMargins,
  withOrientation,
  withPaperSize,
  type PageOrientation
} from './pageSetup'
import type { PageSetup } from './pageSetup'
import {
  canContinueNumbering,
  changeSelectionCase,
  clearAbsorbedFormatting,
  selectionStyleProps,
  setNumberingContinuation,
  sortSelectedParagraphs
} from './documentEdits'
import type { NumberFormat, ParagraphBorder, TabStop } from './paragraphFormat'
import { BULLET_STYLES } from './paragraphFormat'
import { activeParagraphStyleId, applyStyle, isStyleActive } from './paragraphStyles'
import { findStyle, isBuiltInStyle, removeStyle, upsertStyle, type WriterStyle } from './styles'
import type { CaseMode } from './textCase'
import { canChangeOutlineLevel, canMoveAtCursor, changeOutlineLevel, moveAtCursor } from './outlineEdits'
import type { ViewMode } from './views'
import { COLUMNS } from './columns'
import type { ZoomPreset } from './zoom'

/**
 * Registro de comandos de Texto (el patrón Command, el mismo que usan VS Code o los editores serios).
 *
 * Cada acción del editor existe UNA vez aquí, con su nombre, su atajo y cómo saber si está activa o
 * disponible. La cinta, los atajos de teclado y el menú nativo no saben hacer nada: piden un comando
 * por su id. Ventajas:
 *   - Añadir un botón es una línea en la pestaña (`<CommandButton command="bold" />`), no un onClick.
 *   - El mismo "Negrita" se comporta igual se pulse desde donde se pulse.
 *   - Es la lista de "lo que se puede hacer" que podrá recibir el Asistente como herramientas.
 *   - Se prueba sin React: basta un editor de Tiptap sin pantalla (commands.test.ts).
 *
 * La interfaz que no es del documento (paneles, buscar, configuración de página) llega por `ui`: así
 * el registro no depende de React ni de cómo se pinten los paneles.
 */

export type FindMode = 'find' | 'replace'

/** Lo que los comandos pueden pedirle a la interfaz del editor. */
export interface WriterUi {
  showMarks: boolean
  toggleMarks(): void
  openFind(mode: FindMode): void
  addComment(): void
  commentsOpen: boolean
  toggleComments(): void
  headerFooterOpen: boolean
  toggleHeaderFooter(): void
  /** Hoja de la sección donde está el cursor (sin secciones, la del documento). */
  pageSetup: PageSetup
  /** El documento tiene saltos de sección (más de un tamaño de hoja). */
  hasSections: boolean
  setPageSetup(setup: PageSetup): void
  openPageSetupDialog(): void
  /** Estilos del documento (fase 13). */
  styles: WriterStyle[]
  setStyles(styles: WriterStyle[]): void
  /** Abre el cuadro para modificar un estilo, o para crear uno nuevo si no se indica. */
  openStyleDialog(styleId?: string): void
  stylesPanelOpen: boolean
  toggleStylesPanel(): void
  numberedHeadings: boolean
  /** Guiones automáticos (Disposición > Guiones). */
  hyphenation: boolean
  setHyphenation(enabled: boolean): void
  setNumberedHeadings(numbered: boolean): void
  openTabStopsDialog(): void
  /** Vista y navegación (fase 14). */
  viewMode: ViewMode
  setViewMode(mode: ViewMode): void
  navigationOpen: boolean
  toggleNavigation(): void
  showRuler: boolean
  toggleRuler(): void
  zoom: number
  /** "Varias páginas": las hojas en filas, unas al lado de otras. */
  multiPage: boolean
  /** Un preset ("Una página"...) o un factor exacto (1 = 100 %). */
  setZoom(zoom: ZoomPreset | number): void
  splitOpen: boolean
  toggleSplit(): void
  openWordCount(): void
  readAloudOpen: boolean
  toggleReadAloud(): void
}

export interface CommandContext {
  editor: Editor
  ui: WriterUi
}

/**
 * Un comando. `Arg` es el valor que necesitan los comandos con parámetro (tamaño de letra,
 * alineación...); los demás no reciben nada. Se declaran como métodos a propósito: así un comando
 * con `Arg = string` cabe en el registro común.
 */
export interface WriterCommand<Arg = void> {
  label: string
  /** Atajo para la ayuda emergente ("Ctrl/Cmd+B"). */
  shortcut?: string
  /**
   * Atajo que registra el editor (sintaxis de Tiptap, "Mod-Enter"). Solo para los que Tiptap no
   * trae ya de serie (Negrita, Cursiva... ya tienen el suyo).
   */
  keys?: string
  run(context: CommandContext, arg: Arg): void
  isActive?(context: CommandContext, arg: Arg): boolean
  isEnabled?(context: CommandContext, arg: Arg): boolean
}

const chain = ({ editor }: CommandContext) => editor.chain().focus()
const currentFontSize = (editor: Editor) => {
  const value = editor.getAttributes('textStyle').fontSize as string | undefined
  return value ? parseFloat(value) : DEFAULT_FONT_SIZE_PT
}

/** Fecha larga en español ("16 de noviembre de 2026"), la que inserta el botón Fecha. */
export const longDate = (date = new Date()) =>
  date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

async function paste({ editor }: CommandContext): Promise<void> {
  editor.commands.focus()
  // En Electron execCommand('paste') respeta el formato; si no está disponible, pegamos texto plano.
  if (!document.execCommand('paste')) {
    const text = await navigator.clipboard.readText()
    editor.commands.insertContent(text)
  }
}

/** Pegado especial: el texto del portapapeles sin ningún formato (como Ctrl+Mayús+V). */
async function pasteText({ editor }: CommandContext): Promise<void> {
  const text = await navigator.clipboard.readText()
  editor.chain().focus().insertContent(text.replace(/\r\n?/g, '\n').split('\n').map(textParagraph)).run()
}

const textParagraph = (line: string) => ({
  type: 'paragraph',
  content: line ? [{ type: 'text', text: line }] : []
})

/** Atributo del bloque donde está el cursor (párrafo o título). */
const blockAttr = (editor: Editor, name: string): unknown => editor.state.selection.$from.parent.attrs[name] ?? null

const withoutUndefined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>

/** `satisfies` comprueba la forma de cada comando sin perder el tipo de su argumento. */
export const WRITER_COMMANDS = {
  // --- Portapapeles ---
  paste: { label: 'Pegar', shortcut: 'Ctrl/Cmd+V', run: (context) => void paste(context) },
  pasteText: { label: 'Pegar solo texto', run: (context) => void pasteText(context) },
  cut: { label: 'Cortar', shortcut: 'Ctrl/Cmd+X', run: () => document.execCommand('cut') },
  copy: { label: 'Copiar', shortcut: 'Ctrl/Cmd+C', run: () => document.execCommand('copy') },

  // --- Fuente ---
  fontFamily: {
    label: 'Fuente',
    run: (context, family: string) => chain(context).setFontFamily(family).run()
  },
  fontSize: {
    label: 'Tamaño de fuente',
    run: (context, pt: number) => chain(context).setFontSize(`${pt}pt`).run()
  },
  growFont: {
    label: 'Aumentar tamaño',
    run: (context) =>
      chain(context)
        .setFontSize(`${nextFontSize(currentFontSize(context.editor), 1)}pt`)
        .run()
  },
  shrinkFont: {
    label: 'Disminuir tamaño',
    run: (context) =>
      chain(context)
        .setFontSize(`${nextFontSize(currentFontSize(context.editor), -1)}pt`)
        .run()
  },
  clearFormatting: { label: 'Borrar formato', run: (context) => chain(context).unsetAllMarks().clearNodes().run() },
  bold: {
    label: 'Negrita',
    shortcut: 'Ctrl/Cmd+B',
    run: (context) => chain(context).toggleBold().run(),
    isActive: ({ editor }) => editor.isActive('bold')
  },
  italic: {
    label: 'Cursiva',
    shortcut: 'Ctrl/Cmd+I',
    run: (context) => chain(context).toggleItalic().run(),
    isActive: ({ editor }) => editor.isActive('italic')
  },
  underline: {
    label: 'Subrayado',
    shortcut: 'Ctrl/Cmd+U',
    run: (context) => chain(context).toggleUnderline().run(),
    isActive: ({ editor }) => editor.isActive('underline')
  },
  strike: {
    label: 'Tachado',
    run: (context) => chain(context).toggleStrike().run(),
    isActive: ({ editor }) => editor.isActive('strike')
  },
  subscript: {
    label: 'Subíndice',
    run: (context) => chain(context).unsetSuperscript().toggleSubscript().run(),
    isActive: ({ editor }) => editor.isActive('subscript')
  },
  superscript: {
    label: 'Superíndice',
    run: (context) => chain(context).unsetSubscript().toggleSuperscript().run(),
    isActive: ({ editor }) => editor.isActive('superscript')
  },
  highlight: {
    label: 'Color de resaltado',
    run: (context, color: string | null) =>
      color ? chain(context).setHighlight({ color }).run() : chain(context).unsetHighlight().run()
  },
  fontColor: {
    label: 'Color de fuente',
    run: (context, color: string | null) =>
      color ? chain(context).setColor(color).run() : chain(context).unsetColor().run()
  },

  // --- Párrafo ---
  bulletList: {
    label: 'Viñetas',
    run: (context) => chain(context).toggleBulletList().run(),
    isActive: ({ editor }) => editor.isActive('bulletList')
  },
  orderedList: {
    label: 'Numeración',
    run: (context) => chain(context).toggleOrderedList().run(),
    isActive: ({ editor }) => editor.isActive('orderedList')
  },
  outdent: { label: 'Disminuir sangría', run: (context) => chain(context).outdent().run() },
  indent: { label: 'Aumentar sangría', run: (context) => chain(context).indent().run() },
  toggleMarks: {
    label: 'Mostrar marcas de párrafo',
    run: ({ ui }) => ui.toggleMarks(),
    isActive: ({ ui }) => ui.showMarks
  },
  textAlign: {
    label: 'Alinear',
    run: (context, align: TextAlignment) => chain(context).setTextAlign(align).run(),
    isActive: ({ editor }, align: TextAlignment) =>
      align === 'left'
        ? !ALIGNMENTS.some((other) => other !== 'left' && editor.isActive({ textAlign: other }))
        : editor.isActive({ textAlign: align })
  },
  lineHeight: {
    label: 'Interlineado',
    run: (context, value: string) => chain(context).setLineHeight(value).run(),
    isActive: ({ editor }, value: string) => editor.getAttributes('paragraph').lineHeight === value
  },
  spaceBefore: {
    label: 'Espacio antes del párrafo',
    run: (context, pt: number | null) => chain(context).setSpacing({ before: pt }).run()
  },
  spaceAfter: {
    label: 'Espacio después del párrafo',
    run: (context, pt: number | null) => chain(context).setSpacing({ after: pt }).run()
  },
  toggleSpaceBefore: {
    label: 'Agregar espacio antes del párrafo',
    run: (context) =>
      chain(context)
        .setSpacing({ before: blockAttr(context.editor, 'spaceBefore') ? null : 12 })
        .run(),
    isActive: ({ editor }) => !!blockAttr(editor, 'spaceBefore')
  },
  toggleSpaceAfter: {
    label: 'Quitar espacio después del párrafo',
    run: (context) =>
      chain(context)
        .setSpacing({ after: blockAttr(context.editor, 'spaceAfter') === 0 ? null : 0 })
        .run(),
    isActive: ({ editor }) => blockAttr(editor, 'spaceAfter') === 0
  },
  indentLeftCm: {
    label: 'Sangría izquierda',
    run: (context, cm: number) => chain(context).setIndentCm(cm).run()
  },
  indentRightCm: {
    label: 'Sangría derecha',
    run: (context, cm: number) => chain(context).setIndentRight(cm).run()
  },
  shading: {
    label: 'Sombreado',
    run: (context, color: string | null) => chain(context).setShading(color).run()
  },
  paragraphBorder: {
    label: 'Bordes',
    run: (context, border: ParagraphBorder | 'none') => chain(context).setParagraphBorder(border).run(),
    isActive: ({ editor }, border: ParagraphBorder | 'none') => (blockAttr(editor, 'border') ?? 'none') === border
  },
  tabStopsDialog: { label: 'Tabulaciones…', run: ({ ui }) => ui.openTabStopsDialog() },
  tabStops: {
    label: 'Tabulaciones',
    run: (context, stops: TabStop[]) => chain(context).setTabStops(stops).run()
  },
  bulletStyle: {
    label: 'Biblioteca de viñetas',
    run: (context, bulletId: string) => {
      const run = chain(context)
      if (!context.editor.isActive('bulletList')) run.toggleBulletList()
      // La de siempre (disc) no se guarda: el archivo queda como antes.
      run.updateAttributes('bulletList', { bulletStyle: bulletId === BULLET_STYLES[0].id ? null : bulletId }).run()
    },
    isActive: ({ editor }, bulletId: string) =>
      editor.isActive('bulletList') &&
      (editor.getAttributes('bulletList').bulletStyle ?? BULLET_STYLES[0].id) === bulletId
  },
  numberFormat: {
    label: 'Formato de número',
    run: (context, format: NumberFormat) => {
      const run = chain(context)
      if (!context.editor.isActive('orderedList')) run.toggleOrderedList()
      run.updateAttributes('orderedList', { numberFormat: format === 'decimal' ? null : format }).run()
    },
    isActive: ({ editor }, format: NumberFormat) =>
      editor.isActive('orderedList') && (editor.getAttributes('orderedList').numberFormat ?? 'decimal') === format
  },
  restartNumbering: {
    label: 'Reiniciar en 1',
    run: ({ editor }) => setNumberingContinuation(editor, 'restart'),
    isEnabled: ({ editor }) => editor.isActive('orderedList')
  },
  continueNumbering: {
    label: 'Continuar numeración',
    run: ({ editor }) => setNumberingContinuation(editor, 'continue'),
    isEnabled: ({ editor }) => canContinueNumbering(editor)
  },
  numberedHeadings: {
    label: 'Numerar los títulos (1, 1.1, 1.1.1)',
    run: ({ ui }) => ui.setNumberedHeadings(!ui.numberedHeadings),
    isActive: ({ ui }) => ui.numberedHeadings
  },
  sortParagraphs: {
    label: 'Ordenar',
    run: ({ editor }, order: 'asc' | 'desc') => sortSelectedParagraphs(editor, order === 'desc'),
    isEnabled: ({ editor }) => editor.state.selection.$from.index(0) !== editor.state.selection.$to.index(0)
  },
  changeCase: {
    label: 'Cambiar mayúsculas y minúsculas',
    run: ({ editor }, mode: CaseMode) => changeSelectionCase(editor, mode),
    isEnabled: ({ editor }) => !editor.state.selection.empty
  },
  formatPainter: {
    label: 'Copiar formato',
    run: ({ editor }, sticky: boolean) =>
      editor.storage.formatPainter.copied && !sticky
        ? editor.commands.cancelFormatPainter()
        : editor.chain().focus().copyFormat(sticky).run(),
    isActive: ({ editor }) => !!editor.storage.formatPainter?.copied
  },

  // --- Estilos ---
  applyStyle: {
    label: 'Aplicar estilo',
    run: ({ editor, ui }, styleId: string) => {
      const style = findStyle(ui.styles, styleId)
      if (style) applyStyle(editor, style)
    },
    isActive: ({ editor, ui }, styleId: string) => {
      const style = findStyle(ui.styles, styleId)
      return !!style && isStyleActive(editor, style)
    }
  },
  modifyStyle: { label: 'Modificar…', run: ({ ui }, styleId: string) => ui.openStyleDialog(styleId) },
  newStyle: { label: 'Nuevo estilo…', run: ({ ui }) => ui.openStyleDialog() },
  updateStyleFromSelection: {
    label: 'Actualizar para que coincida con la selección',
    run: ({ editor, ui }, styleId: string) => {
      const style = findStyle(ui.styles, styleId)
      if (!style) return
      const props = selectionStyleProps(editor)
      // Un estilo de carácter no tiene formato de párrafo.
      const absorbed =
        style.type === 'character'
          ? {
              fontFamily: props.fontFamily,
              fontSize: props.fontSize,
              color: props.color,
              bold: props.bold,
              italic: props.italic,
              underline: props.underline
            }
          : props
      ui.setStyles(upsertStyle(ui.styles, { ...style, props: { ...style.props, ...withoutUndefined(absorbed) } }))
      if (style.type === 'paragraph' && activeParagraphStyleId(editor) === style.id) clearAbsorbedFormatting(editor)
    }
  },
  deleteStyle: {
    label: 'Eliminar estilo',
    run: ({ ui }, styleId: string) => ui.setStyles(removeStyle(ui.styles, styleId)),
    isEnabled: (_context, styleId: string) => !isBuiltInStyle(styleId)
  },
  toggleStylesPanel: {
    label: 'Panel de estilos',
    run: ({ ui }) => ui.toggleStylesPanel(),
    isActive: ({ ui }) => ui.stylesPanelOpen
  },

  // --- Edición ---
  find: { label: 'Buscar', shortcut: 'Ctrl/Cmd+F', run: ({ ui }) => ui.openFind('find') },
  selectAll: { label: 'Seleccionar todo', shortcut: 'Ctrl/Cmd+A', run: (context) => chain(context).selectAll().run() },
  selectParagraph: {
    label: 'Seleccionar el párrafo',
    run: (context) =>
      chain(context)
        .command(({ tr, state }) => {
          const { $from } = state.selection
          tr.setSelection(TextSelection.create(tr.doc, $from.start(), $from.end()))
          return true
        })
        .run()
  },
  replace: { label: 'Reemplazar', run: ({ ui }) => ui.openFind('replace') },

  // --- Insertar ---
  insertTable: {
    label: 'Tabla',
    run: (context, size: { rows: number; cols: number }) =>
      chain(context).insertTable({ rows: size.rows, cols: size.cols, withHeaderRow: false }).run()
  },
  insertImage: {
    label: 'Imagen',
    run: (context, image: { src: string; alt: string }) => chain(context).setImage(image).run()
  },
  horizontalRule: { label: 'Línea horizontal', run: (context) => chain(context).setHorizontalRule().run() },
  insertDate: { label: 'Fecha', run: (context) => chain(context).insertContent(longDate()).run() },
  blockquote: {
    label: 'Cita',
    run: (context) => chain(context).toggleBlockquote().run(),
    isActive: ({ editor }) => editor.isActive('blockquote')
  },
  codeBlock: {
    label: 'Bloque de código',
    run: (context) => chain(context).toggleCodeBlock().run(),
    isActive: ({ editor }) => editor.isActive('codeBlock')
  },
  pageBreak: {
    label: 'Salto de página',
    shortcut: 'Ctrl/Cmd+Intro',
    keys: 'Mod-Enter',
    run: (context) => chain(context).setPageBreak().run(),
    // En una tabla o una lista no tiene sentido (ni en Word): el salto es entre bloques del documento.
    isEnabled: ({ editor }) =>
      !editor.isActive('table') && !editor.isActive('listItem') && !editor.isActive('codeBlock')
  },
  sectionBreak: {
    label: 'Salto de sección',
    // Lo de detrás empieza en hoja nueva con la misma hoja que la sección actual; luego se cambia
    // con Márgenes, Orientación o Tamaño, que ya actúan sobre la sección del cursor.
    run: (context) => chain(context).setSectionBreak(context.ui.pageSetup).run(),
    isEnabled: ({ editor }) =>
      !editor.isActive('table') && !editor.isActive('listItem') && !editor.isActive('codeBlock')
  },
  columnBreak: {
    label: 'Salto de columna',
    run: (context) => chain(context).setColumnBreak().run(),
    // Solo tiene sentido dentro de un bloque de columnas.
    isEnabled: ({ editor }) => columnsAtCursor(editor) > 1 && !editor.isActive('table')
  },
  columns: {
    label: 'Columnas',
    run: (context, count: number) => chain(context).setColumns(count).run(),
    isActive: ({ editor }, count: number) => columnsAtCursor(editor) === count,
    isEnabled: ({ editor }) => !editor.isActive('table')
  },
  addComment: {
    label: 'Comentario',
    run: ({ ui }) => ui.addComment(),
    isEnabled: ({ editor }) => !editor.state.selection.empty
  },
  toggleComments: {
    label: 'Ver comentarios',
    run: ({ ui }) => ui.toggleComments(),
    isActive: ({ ui }) => ui.commentsOpen
  },
  toggleHeaderFooter: {
    label: 'Encabezado y pie de página',
    run: ({ ui }) => ui.toggleHeaderFooter(),
    isActive: ({ ui }) => ui.headerFooterOpen
  },

  // --- Disposición ---
  marginPreset: {
    label: 'Márgenes',
    run: ({ ui }, presetId: string) => {
      const preset = MARGIN_PRESETS.find((candidate) => candidate.id === presetId)
      if (preset) ui.setPageSetup(withMargins(ui.pageSetup, preset.margins))
    }
  },
  orientation: {
    label: 'Orientación',
    run: ({ ui }, orientation: PageOrientation) => ui.setPageSetup(withOrientation(ui.pageSetup, orientation)),
    isActive: ({ ui }, orientation: PageOrientation) => ui.pageSetup.orientation === orientation
  },
  hyphenation: {
    label: 'Guiones',
    run: ({ ui }, enabled: boolean) => ui.setHyphenation(enabled),
    isActive: ({ ui }, enabled: boolean) => ui.hyphenation === enabled
  },
  paperSize: {
    label: 'Tamaño',
    run: ({ ui }, paperId: string) => {
      const paper = PAPER_SIZES.find((candidate) => candidate.id === paperId)
      if (paper) ui.setPageSetup(withPaperSize(ui.pageSetup, paper))
    }
  },
  pageSetupDialog: { label: 'Configurar página', run: ({ ui }) => ui.openPageSetupDialog() },

  // --- Vista (fase 14) ---
  viewMode: {
    label: 'Vista',
    run: ({ ui }, mode: ViewMode) => ui.setViewMode(mode),
    isActive: ({ ui }, mode: ViewMode) => ui.viewMode === mode
  },
  toggleNavigation: {
    label: 'Panel de navegación',
    keys: 'Mod-Alt-n',
    shortcut: 'Ctrl/Cmd+Alt+N',
    run: ({ ui }) => ui.toggleNavigation(),
    isActive: ({ ui }) => ui.navigationOpen
  },
  toggleRuler: { label: 'Regla', run: ({ ui }) => ui.toggleRuler(), isActive: ({ ui }) => ui.showRuler },
  zoom: {
    label: 'Zoom',
    run: ({ ui }, zoom: ZoomPreset | number) => ui.setZoom(zoom),
    // "Varias páginas" pone las hojas en columnas iguales: con secciones de otro tamaño no cabe.
    isEnabled: ({ ui }, zoom: ZoomPreset | number) => zoom !== 'multiPage' || !ui.hasSections,
    // Solo 100 % y "Varias páginas" se pueden marcar como activos: "Una página" depende de la ventana.
    isActive: ({ ui }, zoom: ZoomPreset | number) => {
      if (zoom === 'multiPage') return ui.multiPage
      return !ui.multiPage && (zoom === 'actual' ? ui.zoom === 1 : ui.zoom === zoom)
    }
  },
  toggleSplit: { label: 'Dividir', run: ({ ui }) => ui.toggleSplit(), isActive: ({ ui }) => ui.splitOpen },
  wordCount: {
    label: 'Contar palabras',
    keys: 'Mod-Shift-g',
    shortcut: 'Ctrl/Cmd+Mayús+G',
    run: ({ ui }) => ui.openWordCount()
  },
  readAloud: {
    label: 'Leer en voz alta',
    run: ({ ui }) => ui.toggleReadAloud(),
    isActive: ({ ui }) => ui.readAloudOpen,
    isEnabled: () => typeof window !== 'undefined' && 'speechSynthesis' in window
  },

  // --- Esquema ---
  outlinePromote: {
    label: 'Subir nivel',
    keys: 'Alt-Shift-ArrowLeft',
    shortcut: 'Alt+Mayús+←',
    run: ({ editor }) => void changeOutlineLevel(editor, 'promote'),
    isEnabled: ({ editor }) => canChangeOutlineLevel(editor, 'promote')
  },
  outlineDemote: {
    label: 'Bajar nivel',
    keys: 'Alt-Shift-ArrowRight',
    shortcut: 'Alt+Mayús+→',
    run: ({ editor }) => void changeOutlineLevel(editor, 'demote'),
    isEnabled: ({ editor }) => canChangeOutlineLevel(editor, 'demote')
  },
  outlineToBody: {
    label: 'Texto normal',
    run: ({ editor }) => void changeOutlineLevel(editor, 'body'),
    isEnabled: ({ editor }) => canChangeOutlineLevel(editor, 'body')
  },
  outlineMoveUp: {
    label: 'Mover arriba',
    keys: 'Alt-Shift-ArrowUp',
    shortcut: 'Alt+Mayús+↑',
    run: ({ editor }) => void moveAtCursor(editor, 'up'),
    isEnabled: ({ editor }) => canMoveAtCursor(editor, 'up')
  },
  outlineMoveDown: {
    label: 'Mover abajo',
    keys: 'Alt-Shift-ArrowDown',
    shortcut: 'Alt+Mayús+↓',
    run: ({ editor }) => void moveAtCursor(editor, 'down'),
    isEnabled: ({ editor }) => canMoveAtCursor(editor, 'down')
  },
  outlineExpandAll: { label: 'Expandir todo', run: ({ editor }) => editor.commands.setOutlineFoldAll(false) },
  outlineCollapseAll: { label: 'Contraer todo', run: ({ editor }) => editor.commands.setOutlineFoldAll(true) },
  outlineShowLevel: {
    label: 'Mostrar nivel',
    run: ({ editor }, level: number | null) => editor.commands.setOutlineLevel(level),
    isActive: ({ editor }, level: number | null) => (editor.storage.outlineView?.showLevel ?? null) === level
  },
  // --- Tabla (pestaña contextual) ---
  addRowBefore: { label: 'Fila encima', run: (context) => chain(context).addRowBefore().run() },
  addRowAfter: { label: 'Fila debajo', run: (context) => chain(context).addRowAfter().run() },
  addColumnBefore: { label: 'Columna a la izquierda', run: (context) => chain(context).addColumnBefore().run() },
  addColumnAfter: { label: 'Columna a la derecha', run: (context) => chain(context).addColumnAfter().run() },
  deleteRow: { label: 'Eliminar fila', run: (context) => chain(context).deleteRow().run() },
  deleteColumn: { label: 'Eliminar columna', run: (context) => chain(context).deleteColumn().run() },
  deleteTable: { label: 'Eliminar tabla', run: (context) => chain(context).deleteTable().run() },
  mergeCells: {
    label: 'Combinar celdas',
    run: (context) => chain(context).mergeCells().run(),
    isEnabled: ({ editor }) => editor.can().mergeCells()
  },
  splitCell: {
    label: 'Dividir celda',
    run: (context) => chain(context).splitCell().run(),
    isEnabled: ({ editor }) => editor.can().splitCell()
  },
  toggleHeaderRow: {
    label: 'Fila de encabezado',
    run: (context) => chain(context).toggleHeaderRow().run(),
    isActive: ({ editor }) => isInHeaderRow(editor)
  }
} satisfies Record<string, WriterCommand<never>>

export type TextAlignment = 'left' | 'center' | 'right' | 'justify'
const ALIGNMENTS: TextAlignment[] = ['left', 'center', 'right', 'justify']

export type WriterCommandId = keyof typeof WRITER_COMMANDS
/** El argumento que espera cada comando (`void` si no espera ninguno). */
export type CommandArg<Id extends WriterCommandId> =
  Parameters<(typeof WRITER_COMMANDS)[Id]['run']> extends [unknown, infer Arg] ? Arg : undefined

/** Los comandos vistos de forma uniforme, para quien no necesita el tipo exacto del argumento. */
type AnyCommand = WriterCommand<unknown>
const commandOf = (id: WriterCommandId) => WRITER_COMMANDS[id] as AnyCommand

/** Tupla de argumentos: `runCommand(ctx, 'bold')` y `runCommand(ctx, 'fontSize', 14)`. */
export type ArgsOf<Id extends WriterCommandId> = CommandArg<Id> extends undefined ? [] : [arg: CommandArg<Id>]

export function runCommand<Id extends WriterCommandId>(context: CommandContext, id: Id, ...args: ArgsOf<Id>): boolean {
  const command = commandOf(id)
  if (command.isEnabled && !command.isEnabled(context, args[0])) return false
  command.run(context, args[0])
  return true
}

export function commandState<Id extends WriterCommandId>(
  context: CommandContext,
  id: Id,
  ...args: ArgsOf<Id>
): { active: boolean; enabled: boolean } {
  const command = commandOf(id)
  return {
    active: command.isActive?.(context, args[0]) ?? false,
    enabled: command.isEnabled?.(context, args[0]) ?? true
  }
}

export function commandLabel(id: WriterCommandId): { label: string; shortcut?: string } {
  const { label, shortcut } = commandOf(id)
  return { label, shortcut }
}

/** Atajos que el editor tiene que registrar (los que Tiptap no trae), como pares tecla -> comando. */
export function commandKeyBindings(): { keys: string; id: WriterCommandId }[] {
  return (Object.keys(WRITER_COMMANDS) as WriterCommandId[]).flatMap((id) => {
    const { keys } = commandOf(id)
    return keys ? [{ keys, id }] : []
  })
}

/** ¿La fila donde está el cursor es de encabezado? (todas sus celdas son `tableHeader`) */
export function isInHeaderRow(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'tableRow') {
      let allHeaders = node.childCount > 0
      node.forEach((cell) => {
        if (cell.type.name !== 'tableHeader') allHeaders = false
      })
      return allHeaders
    }
  }
  return false
}

/** Columnas del bloque donde está el cursor (1 si no está en un bloque de columnas). */
export function columnsAtCursor(editor: Editor): number {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === COLUMNS) return Number(node.attrs.count) || 2
  }
  return 1
}
