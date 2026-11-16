// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createWriterExtensions } from '../editor/extensions'
import { OutlineView, outlineViewState } from '../editor/OutlineView'
import { documentSentences, ReadAloudHighlight } from '../editor/ReadAloud'
import { runCommand, type CommandContext, type WriterUi } from './commands'
import { changeOutlineLevel, documentOutline, moveAtCursor, moveSection } from './outlineEdits'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function setup(html: string) {
  editor = new Editor({ extensions: [...createWriterExtensions(), OutlineView, ReadAloudHighlight], content: html })
  return editor
}

/** El documento como "# Título" / "texto", para comparar de un vistazo. */
const shape = (current: Editor) =>
  documentOutline(current.state.doc).blocks.map(
    (block) => (block.level ? `${'#'.repeat(block.level)} ` : '') + block.text
  )

/** Pone el cursor dentro del bloque de primer nivel `index`. */
const cursorIn = (current: Editor, index: number) =>
  current.commands.setTextSelection(documentOutline(current.state.doc).positions[index] + 1)

const DOC = '<h1>A</h1><p>a1</p><h2>A.1</h2><p>a11</p><h1>B</h1><p>b1</p>'

describe('esquema sobre el documento', () => {
  it('arrastrar un título mueve su sección entera en un solo paso de deshacer', () => {
    const current = setup(DOC)
    current.commands.insertContentAt(current.state.doc.content.size - 1, ' escrito justo antes')
    expect(moveSection(current, 4, 0)).toBe(true)
    expect(shape(current)).toEqual(['# B', 'b1 escrito justo antes', '# A', 'a1', '## A.1', 'a11'])
    expect(current.state.selection.$from.parent.textContent).toBe('B')
    // Deshacer quita el movimiento, no lo que se acababa de escribir.
    current.commands.undo()
    expect(shape(current)).toEqual(['# A', 'a1', '## A.1', 'a11', '# B', 'b1 escrito justo antes'])
    // No se puede meter una sección dentro de sí misma.
    expect(moveSection(current, 0, 2)).toBe(false)
  })

  it('mover arriba y abajo desde el cursor', () => {
    const current = setup(DOC)
    cursorIn(current, 0)
    expect(moveAtCursor(current, 'down')).toBe(true)
    expect(shape(current)).toEqual(['# B', 'b1', '# A', 'a1', '## A.1', 'a11'])
    expect(moveAtCursor(current, 'down')).toBe(false)
  })

  it('sube y baja niveles, y convierte texto en título y al revés conservando la alineación', () => {
    const current = setup('<h1>A</h1><p style="text-align: center">texto</p><h2>B</h2><p>fin</p>')
    cursorIn(current, 1)
    changeOutlineLevel(current, 'promote')
    expect(shape(current)).toEqual(['# A', '# texto', '## B', 'fin'])
    expect(current.state.doc.child(1).attrs.textAlign).toBe('center')
    cursorIn(current, 2)
    changeOutlineLevel(current, 'promote')
    changeOutlineLevel(current, 'demote')
    changeOutlineLevel(current, 'demote')
    expect(shape(current)).toEqual(['# A', '# texto', '### B', 'fin'])
    changeOutlineLevel(current, 'body')
    expect(shape(current)).toEqual(['# A', '# texto', 'B', 'fin'])
  })

  it('la vista Esquema pliega títulos y los sigue aunque cambie el texto de encima', () => {
    const current = setup(DOC)
    current.commands.setOutlineView(true)
    current.commands.toggleOutlineFold(0)
    expect(outlineViewState(current.state).collapsed).toEqual([0])
    current.commands.insertContentAt(0, '<p>nuevo</p>')
    const [collapsed] = outlineViewState(current.state).collapsed
    expect(current.state.doc.nodeAt(collapsed)?.textContent).toBe('A')
    current.commands.setOutlineFoldAll(true)
    expect(outlineViewState(current.state).collapsed).toHaveLength(3) // A, A.1 y B tienen algo debajo
    current.commands.setOutlineFoldAll(false)
    expect(outlineViewState(current.state).collapsed).toEqual([])
  })

  it('los comandos del Esquema pasan por el registro y saben cuándo no se pueden usar', () => {
    const current = setup(DOC)
    const context: CommandContext = { editor: current, ui: {} as WriterUi }
    cursorIn(current, 0)
    expect(runCommand(context, 'outlinePromote')).toBe(false) // ya es Título 1
    expect(runCommand(context, 'outlineMoveUp')).toBe(false)
    expect(runCommand(context, 'outlineMoveDown')).toBe(true)
    runCommand(context, 'outlineShowLevel', 1)
    expect(current.storage.outlineView.showLevel).toBe(1)
  })
})

describe('leer en voz alta sobre el documento', () => {
  it('cada frase sabe dónde está, aunque haya negritas', () => {
    const current = setup('<p>Hola <strong>mundo</strong>. Adiós.</p><p>Otra frase.</p>')
    const sentences = documentSentences(current.state.doc)
    expect(sentences.map((sentence) => sentence.text)).toEqual(['Hola mundo.', 'Adiós.', 'Otra frase.'])
    for (const sentence of sentences) {
      expect(current.state.doc.textBetween(sentence.from, sentence.to)).toBe(sentence.text)
    }
    // Desde el cursor: la frase donde está y las siguientes.
    const fromSecond = documentSentences(current.state.doc, sentences[1].from + 2)
    expect(fromSecond.map((sentence) => sentence.text)).toEqual(['Adiós.', 'Otra frase.'])
  })
})
