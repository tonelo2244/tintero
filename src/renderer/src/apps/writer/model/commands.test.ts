// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createWriterExtensions } from '../editor/extensions'
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

let editor: Editor | null = null
afterEach(() => editor?.destroy())

/** Un editor sin pantalla y una interfaz de mentira que apunta lo que le piden. */
function setup(html: string) {
  editor = new Editor({ extensions: createWriterExtensions(), content: html })
  const calls: string[] = []
  let pageSetup: PageSetup = DEFAULT_PAGE_SETUP
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
    openPageSetupDialog: () => calls.push('pageSetupDialog')
  }
  const context: CommandContext = { editor, ui }
  return { context, calls, editor, page: () => pageSetup }
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
