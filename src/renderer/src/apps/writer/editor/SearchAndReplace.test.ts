// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createWriterExtensions } from './extensions'
import { getSearchState } from './SearchAndReplace'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function createEditor(html: string): Editor {
  editor = new Editor({ extensions: createWriterExtensions(), content: html })
  return editor
}

const selectedText = (current: Editor) => {
  const { from, to } = current.state.selection
  return current.state.doc.textBetween(from, to)
}

describe('SearchAndReplace', () => {
  it('cuenta las coincidencias y se actualiza al escribir', () => {
    const current = createEditor('<p>gato y gato</p>')
    current.commands.setSearch('gato')
    expect(getSearchState(current.state)?.matches).toHaveLength(2)
    current.commands.insertContentAt(1, 'gato ')
    expect(getSearchState(current.state)?.matches).toHaveLength(3)
  })

  it('salta entre coincidencias dando la vuelta al final', () => {
    const current = createEditor('<p>uno dos uno</p>')
    current.commands.setTextSelection(1)
    current.commands.setSearch('uno')
    current.commands.goToMatch(1)
    expect(current.state.selection.from).toBe(1)
    current.commands.goToMatch(1)
    expect(current.state.selection.from).toBe(9)
    current.commands.goToMatch(1)
    expect(current.state.selection.from).toBe(1)
    current.commands.goToMatch(-1)
    expect(current.state.selection.from).toBe(9)
  })

  it('reemplazar cambia la coincidencia seleccionada, conserva su formato y pasa a la siguiente', () => {
    const current = createEditor('<p><strong>rojo</strong> y rojo</p>')
    current.commands.setSearch('rojo')
    current.commands.goToMatch(1)
    current.commands.replaceMatch('azul')
    expect(current.getHTML()).toBe('<p><strong>azul</strong> y rojo</p>')
    expect(selectedText(current)).toBe('rojo')
  })

  it('reemplazar sin coincidencia seleccionada solo busca la siguiente', () => {
    const current = createEditor('<p>a b a</p>')
    current.commands.setTextSelection(1)
    current.commands.setSearch('b')
    current.commands.replaceMatch('x')
    expect(current.getText()).toBe('a b a')
    expect(selectedText(current)).toBe('b')
  })

  it('reemplazar todo es un único paso de deshacer', () => {
    const current = createEditor('<p>Hola hola HOLA</p><p>hola</p>')
    current.commands.setSearch('hola')
    current.commands.replaceAllMatches('adiós')
    expect(current.getText()).toBe('adiós adiós adiós\n\nadiós')
    expect(getSearchState(current.state)?.matches).toHaveLength(0)
    current.commands.undo()
    expect(current.getText()).toBe('Hola hola HOLA\n\nhola')
  })

  it('cambiar las opciones vuelve a buscar sin repetir el texto', () => {
    const current = createEditor('<p>Sol sol solar</p>')
    current.commands.setSearch('sol')
    expect(getSearchState(current.state)?.matches).toHaveLength(3)
    current.commands.setSearch('sol', { matchCase: true, wholeWord: true })
    expect(getSearchState(current.state)?.matches).toHaveLength(1)
  })
})
