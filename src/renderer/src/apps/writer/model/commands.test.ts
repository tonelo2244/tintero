// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createWriterExtensions } from '../editor/extensions'
import { applyCopiedFormat } from '../editor/FormatPainter'
import {
  commandKeyBindings,
  commandLabel,
  commandState,
  runCommand,
  WRITER_COMMANDS,
  type CommandContext,
  type WriterCommandId,
  type WriterUi
} from './commands'
import { DEFAULT_PAGE_SETUP, type PageSetup } from './pageSetup'
import { DEFAULT_STYLES, type WriterStyle } from './styles'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

/** Un editor sin pantalla y una interfaz de mentira que apunta lo que le piden. */
function setup(html: string) {
  editor = new Editor({ extensions: createWriterExtensions(), content: html })
  const calls: string[] = []
  let pageSetup: PageSetup = DEFAULT_PAGE_SETUP
  let styles: WriterStyle[] = DEFAULT_STYLES
  let numbered = false
  const ui: WriterUi = {
    showMarks: false,
    toggleMarks: () => calls.push('toggleMarks'),
    openFind: (mode) => calls.push(`find:${mode}`),
    addComment: () => calls.push('addComment'),
    commentsOpen: false,
    toggleComments: () => calls.push('toggleComments'),
    headerFooterOpen: false,
    toggleHeaderFooter: () => calls.push('toggleHeaderFooter'),
    get pageSetup() {
      return pageSetup
    },
    setPageSetup: (next) => {
      pageSetup = next
    },
    hasSections: false,
    openPageSetupDialog: () => calls.push('pageSetupDialog'),
    get styles() {
      return styles
    },
    setStyles: (next) => {
      styles = next
    },
    openStyleDialog: (styleId) => calls.push(`styleDialog:${styleId ?? 'new'}`),
    stylesPanelOpen: false,
    toggleStylesPanel: () => calls.push('stylesPanel'),
    get numberedHeadings() {
      return numbered
    },
    setNumberedHeadings: (value) => {
      numbered = value
    },
    hyphenation: false,
    setHyphenation: (enabled) => calls.push(`hyphenation:${enabled}`),
    openTabStopsDialog: () => calls.push('tabStopsDialog'),
    viewMode: 'print',
    setViewMode: (mode) => calls.push(`view:${mode}`),
    navigationOpen: false,
    toggleNavigation: () => calls.push('navigation'),
    showRuler: true,
    toggleRuler: () => calls.push('ruler'),
    zoom: 1,
    multiPage: false,
    setZoom: (zoom) => calls.push(`zoom:${zoom}`),
    splitOpen: false,
    toggleSplit: () => calls.push('split'),
    openWordCount: () => calls.push('wordCount'),
    readAloudOpen: false,
    toggleReadAloud: () => calls.push('readAloud')
  }
  const context: CommandContext = { editor, ui }
  return { context, calls, editor, page: () => pageSetup, styles: () => styles, numbered: () => numbered }
}

describe('registro de comandos', () => {
  it('todos los comandos tienen nombre, y los atajos propios no se repiten', () => {
    for (const id of Object.keys(WRITER_COMMANDS) as WriterCommandId[]) {
      expect(commandLabel(id).label.length).toBeGreaterThan(0)
    }
    const keys = commandKeyBindings().map((binding) => binding.keys)
    expect(new Set(keys).size).toBe(keys.length)
    expect(commandKeyBindings()).toContainEqual({ keys: 'Mod-Enter', id: 'pageBreak' })
  })

  it('un comando de formato cambia el documento y su estado lo refleja', () => {
    const { context, editor } = setup('<p>hola</p>')
    editor.commands.selectAll()
    expect(commandState(context, 'bold').active).toBe(false)
    runCommand(context, 'bold')
    expect(editor.getHTML()).toContain('<strong>hola</strong>')
    expect(commandState(context, 'bold').active).toBe(true)
  })

  it('los comandos con argumento lo usan para hacer y para saber si están activos', () => {
    const { context, editor } = setup('<p>hola</p>')
    runCommand(context, 'textAlign', 'center')
    expect(commandState(context, 'textAlign', 'center').active).toBe(true)
    expect(commandState(context, 'textAlign', 'left').active).toBe(false)
    editor.commands.selectAll()
    runCommand(context, 'fontSize', 18)
    expect(editor.getAttributes('textStyle').fontSize).toBe('18pt')
  })

  it('salto de página: al final del documento deja un párrafo detrás para seguir escribiendo', () => {
    const { context, editor } = setup('<p>Hoja 1</p>')
    editor.commands.focus('end')
    expect(runCommand(context, 'pageBreak')).toBe(true)
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['paragraph', 'pageBreak', 'paragraph'])
  })

  it('salto de página: en una tabla no está disponible y no hace nada', () => {
    const { context, editor } = setup('<table><tr><td><p>celda</p></td></tr></table>')
    editor.commands.setTextSelection(3)
    expect(commandState(context, 'pageBreak').enabled).toBe(false)
    expect(runCommand(context, 'pageBreak')).toBe(false)
    expect(JSON.stringify(editor.getJSON())).not.toContain('pageBreak')
  })

  it('los comandos de página cambian la configuración a través de la interfaz', () => {
    const { context, page } = setup('<p>hola</p>')
    runCommand(context, 'orientation', 'landscape')
    expect(page().orientation).toBe('landscape')
    expect(commandState(context, 'orientation', 'landscape').active).toBe(true)
    runCommand(context, 'marginPreset', 'narrow')
    expect(page().margins.left).toBe(1.27)
    runCommand(context, 'paperSize', 'letter')
    expect(page().size).toEqual({ width: 21.59, height: 27.94 })
  })

  it('los comandos de interfaz llaman a la interfaz, no tocan el documento', () => {
    const { context, calls } = setup('<p>hola</p>')
    runCommand(context, 'find')
    runCommand(context, 'replace')
    runCommand(context, 'toggleMarks')
    runCommand(context, 'pageSetupDialog')
    expect(calls).toEqual(['find:find', 'find:replace', 'toggleMarks', 'pageSetupDialog'])
    // Comentar necesita texto seleccionado.
    expect(runCommand(context, 'addComment')).toBe(false)
  })
})

describe('sangrías', () => {
  it('desde una sangría de la regla, el botón salta al paso entero siguiente', () => {
    const { context, editor } = setup('<p>hola</p>')
    editor.commands.setIndentCm(0.635)
    expect(editor.getJSON().content?.[0].attrs?.indent).toBe(0.5)
    runCommand(context, 'indent')
    expect(editor.getJSON().content?.[0].attrs?.indent).toBe(1)
    runCommand(context, 'outdent')
    expect(editor.getJSON().content?.[0].attrs?.indent).toBe(0)
  })

  it('la sangría de primera línea se guarda en cm y se pinta como text-indent', () => {
    const { editor } = setup('<p>hola</p>')
    editor.commands.setFirstLineIndent(-1.25)
    expect(editor.getHTML()).toContain('text-indent: -1.25cm')
    editor.commands.setFirstLineIndent(0)
    expect(editor.getJSON().content?.[0].attrs?.firstLineIndent).toBeNull()
  })
})

describe('estilos (fase 13)', () => {
  it('aplicar un estilo: los títulos son nodos de título y el resto un atributo del párrafo', () => {
    const { context, editor } = setup('<p>hola</p>')
    runCommand(context, 'applyStyle', 'heading-2')
    expect(editor.getHTML()).toContain('<h2>hola</h2>')
    expect(commandState(context, 'applyStyle', 'heading-2').active).toBe(true)
    runCommand(context, 'applyStyle', 'quote')
    expect(editor.getHTML()).toMatch(/^<p data-style="quote">hola<\/p>/)
    runCommand(context, 'applyStyle', 'normal')
    expect(editor.getHTML()).toMatch(/^<p>hola<\/p>/)
  })

  it('un estilo de carácter es una marca que se pone y se quita', () => {
    const { context, editor } = setup('<p>hola</p>')
    editor.commands.selectAll()
    runCommand(context, 'applyStyle', 'strong')
    expect(editor.getHTML()).toContain('data-char-style="strong"')
    expect(commandState(context, 'applyStyle', 'strong').active).toBe(true)
    runCommand(context, 'applyStyle', 'strong')
    expect(editor.getHTML()).not.toContain('data-char-style')
  })

  it('actualizar un estilo con la selección se lleva el formato al estilo y lo quita del párrafo', () => {
    const { context, editor, styles } = setup('<p>hola</p>')
    runCommand(context, 'textAlign', 'center')
    editor.commands.selectAll()
    runCommand(context, 'bold')
    runCommand(context, 'updateStyleFromSelection', 'normal')
    const normal = styles().find((style) => style.id === 'normal')!
    expect(normal.props).toMatchObject({ align: 'center', bold: true })
    expect(editor.getHTML()).toBe('<p>hola</p>')
  })

  it('solo se pueden borrar los estilos propios', () => {
    const { context, styles } = setup('<p>hola</p>')
    expect(runCommand(context, 'deleteStyle', 'heading-1')).toBe(false)
    context.ui.setStyles([...styles(), { id: 'custom-x', name: 'X', type: 'paragraph', props: {} }])
    expect(runCommand(context, 'deleteStyle', 'custom-x')).toBe(true)
    expect(styles().some((style) => style.id === 'custom-x')).toBe(false)
  })

  it('numerar los títulos es una opción del documento, no texto', () => {
    const { context, editor, numbered } = setup('<h1>Uno</h1>')
    runCommand(context, 'numberedHeadings')
    expect(numbered()).toBe(true)
    expect(editor.getHTML()).toBe('<h1>Uno</h1>')
  })
})

describe('formato de párrafo (fase 13)', () => {
  it('espaciado, sangría derecha, sombreado y bordes se guardan en el párrafo', () => {
    const { context, editor } = setup('<p>hola</p>')
    runCommand(context, 'toggleSpaceBefore')
    runCommand(context, 'spaceAfter', 3)
    runCommand(context, 'indentRightCm', 2)
    runCommand(context, 'shading', '#ffeeaa')
    runCommand(context, 'paragraphBorder', 'box')
    const html = editor.getHTML()
    expect(html).toContain('margin-top: 12pt')
    expect(html).toContain('margin-bottom: 3pt')
    expect(html).toContain('margin-right: 2cm')
    expect(html).toContain('data-shading="#ffeeaa"')
    expect(html).toContain('data-border="box"')
    expect(commandState(context, 'paragraphBorder', 'box').active).toBe(true)
    runCommand(context, 'paragraphBorder', 'none')
    expect(editor.getHTML()).not.toContain('data-border')
  })

  it('biblioteca de viñetas y formato de número: crea la lista si no la hay', () => {
    const { context, editor } = setup('<p>uno</p>')
    runCommand(context, 'bulletStyle', 'check')
    expect(editor.getHTML()).toContain('<ul data-bullet="check">')
    runCommand(context, 'numberFormat', 'lower-roman')
    expect(editor.getHTML()).toContain('<ol data-number-format="lower-roman"')
    expect(commandState(context, 'numberFormat', 'lower-roman').active).toBe(true)
  })

  it('cambiar mayúsculas y ordenar párrafos', () => {
    const { context, editor } = setup('<p>pera</p><p>Árbol</p><p>manzana</p>')
    editor.commands.selectAll()
    runCommand(context, 'sortParagraphs', 'asc')
    expect(editor.getText({ blockSeparator: '|' })).toBe('Árbol|manzana|pera')
    editor.commands.selectAll()
    runCommand(context, 'changeCase', 'upper')
    expect(editor.getText({ blockSeparator: '|' })).toBe('ÁRBOL|MANZANA|PERA')
  })

  it('Tab en medio del texto inserta un tabulador; al principio del párrafo, sangra', () => {
    const { editor } = setup('<p>ab</p>')
    editor.commands.setTextSelection(2)
    editor.commands.keyboardShortcut('Tab')
    expect(editor.getHTML()).toContain('<span data-tab="" class="writer-tab"></span>')
    editor.commands.setTextSelection(1)
    editor.commands.keyboardShortcut('Tab')
    expect(editor.getJSON().content?.[0].attrs?.indent).toBe(1)
  })

  it('copiar formato lleva negrita y alineación a otro párrafo', () => {
    const { context, editor } = setup('<p style="text-align: center"><strong>origen</strong></p><p>destino</p>')
    editor.commands.setTextSelection(3)
    runCommand(context, 'formatPainter', false)
    expect(commandState(context, 'formatPainter', false).active).toBe(true)
    const second = editor.state.doc.child(0).nodeSize
    // Clic en medio de "destino": la brocha lo aplica a la palabra entera.
    editor.commands.setTextSelection(second + 3)
    applyCopiedFormat(editor)
    expect(editor.getHTML()).toBe(
      '<p style="text-align: center;"><strong>origen</strong></p><p style="text-align: center;"><strong>destino</strong></p>'
    )
    // Era de un solo uso: ya no está activa.
    expect(commandState(context, 'formatPainter', false).active).toBe(false)
  })
})

describe('comandos de Vista y Revisar (fase 14)', () => {
  it('piden a la interfaz la vista, el zoom, el panel, dividir, contar y leer', () => {
    const { context, calls } = setup('<p>hola</p>')
    runCommand(context, 'viewMode', 'outline')
    runCommand(context, 'zoom', 'onePage')
    runCommand(context, 'zoom', 1.5)
    runCommand(context, 'toggleNavigation')
    runCommand(context, 'toggleRuler')
    runCommand(context, 'toggleSplit')
    runCommand(context, 'wordCount')
    expect(calls).toEqual(['view:outline', 'zoom:onePage', 'zoom:1.5', 'navigation', 'ruler', 'split', 'wordCount'])
    expect(commandState(context, 'viewMode', 'print').active).toBe(true)
    expect(commandState(context, 'zoom', 'actual').active).toBe(true)
    expect(commandState(context, 'toggleRuler').active).toBe(true)
  })
})
