import type { Editor } from '@tiptap/core'
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
import { PARAGRAPH_STYLES } from './paragraphStyles'

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
  pageSetup: PageSetup
  setPageSetup(setup: PageSetup): void
  openPageSetupDialog(): void
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

/** `satisfies` comprueba la forma de cada comando sin perder el tipo de su argumento. */
export const WRITER_COMMANDS = {
  // --- Portapapeles ---
  paste: { label: 'Pegar', shortcut: 'Ctrl/Cmd+V', run: (context) => void paste(context) },
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
  applyStyle: {
    label: 'Aplicar estilo',
    run: ({ editor }, styleId: string) => PARAGRAPH_STYLES.find((style) => style.id === styleId)?.apply(editor),
    isActive: ({ editor }, styleId: string) =>
      PARAGRAPH_STYLES.find((style) => style.id === styleId)?.isActive(editor) ?? false
  },

  // --- Edición ---
  find: { label: 'Buscar', shortcut: 'Ctrl/Cmd+F', run: ({ ui }) => ui.openFind('find') },
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
  paperSize: {
    label: 'Tamaño',
    run: ({ ui }, paperId: string) => {
      const paper = PAPER_SIZES.find((candidate) => candidate.id === paperId)
      if (paper) ui.setPageSetup(withPaperSize(ui.pageSetup, paper))
    }
  },
  pageSetupDialog: { label: 'Configurar página', run: ({ ui }) => ui.openPageSetupDialog() },

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
