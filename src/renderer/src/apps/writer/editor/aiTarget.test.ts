// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { writingAction } from '../model/ai/writingActions'
import { applyResult, captureTarget } from './aiTarget'
import { createWriterExtensions } from './extensions'

let editor: Editor | null = null
afterEach(() => editor?.destroy())

function createEditor(html: string): Editor {
  editor = new Editor({ extensions: createWriterExtensions(), content: html })
  return editor
}

/** Selecciona el texto `needle` (primera aparición). */
function select(target: Editor, needle: string) {
  let from = -1
  target.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text?.includes(needle)) from = pos + node.text.indexOf(needle)
  })
  target.commands.setTextSelection({ from, to: from + needle.length })
}

describe('captureTarget', () => {
  it('pide selección para corregir, pero resume el documento entero sin ella', () => {
    const target = createEditor('<h1>Plan</h1><p>Texto del plan.</p>')
    expect(captureTarget(target, writingAction('proofread'))).toMatchObject({ ok: false })
    const summary = captureTarget(target, writingAction('summarize'))
    expect(summary.ok && summary.target.text).toBe('# Plan\n\nTexto del plan.')
  })
})

describe('applyResult', () => {
  it('reemplaza dentro de un párrafo sin partirlo', () => {
    const target = createEditor('<p>Hola <strong>mundo</strong> qe tal.</p>')
    select(target, 'qe tal')
    const captured = captureTarget(target, writingAction('proofread'))
    if (!captured.ok) throw new Error(captured.message)
    expect(applyResult(target, captured.target, 'qué tal', 'replace')).toBe(true)
    expect(target.getHTML()).toBe('<p>Hola <strong>mundo</strong> qué tal.</p>')
  })

  it('inserta el resumen debajo del bloque seleccionado', () => {
    const target = createEditor('<p>Primero.</p><p>Segundo.</p>')
    select(target, 'Primero.')
    const captured = captureTarget(target, writingAction('summarize'))
    if (!captured.ok) throw new Error(captured.message)
    applyResult(target, captured.target, 'Resumen.', 'insertBelow')
    expect(target.getHTML()).toBe('<p>Primero.</p><p>Resumen.</p><p>Segundo.</p>')
  })

  it('no aplica si el texto original cambió mientras se generaba', () => {
    const target = createEditor('<p>Uno dos tres.</p>')
    select(target, 'dos')
    const captured = captureTarget(target, writingAction('improve'))
    if (!captured.ok) throw new Error(captured.message)
    target.commands.insertContentAt(1, 'XX')
    expect(applyResult(target, captured.target, 'DOS', 'replace')).toBe(false)
    expect(target.getText()).toBe('XXUno dos tres.')
  })
})
