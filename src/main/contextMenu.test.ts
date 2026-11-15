import { describe, expect, it, vi } from 'vitest'
import { buildContextMenuTemplate, type ContextMenuInput } from './contextMenu'

const base: ContextMenuInput = { isEditable: true, selectionText: '', misspelledWord: '', dictionarySuggestions: [] }
const actions = () => ({ replaceMisspelling: vi.fn(), addToDictionary: vi.fn() })

describe('buildContextMenuTemplate', () => {
  it('ofrece las sugerencias de una palabra mal escrita y añadirla al diccionario', () => {
    const handlers = actions()
    const template = buildContextMenuTemplate(
      { ...base, misspelledWord: 'ola', dictionarySuggestions: ['hola', 'ola', 'olas', 'sola', 'bola', 'cola'] },
      handlers
    )
    const labels = template.map((item) => item.label ?? item.type)
    expect(labels.slice(0, 5)).toEqual(['hola', 'ola', 'olas', 'sola', 'bola'])
    expect(labels).toContain('Añadir «ola» al diccionario')

    template[0].click?.({} as never, undefined, {} as never)
    expect(handlers.replaceMisspelling).toHaveBeenCalledWith('hola')
  })

  it('avisa si no hay sugerencias', () => {
    const template = buildContextMenuTemplate({ ...base, misspelledWord: 'xqzt' }, actions())
    expect(template[0]).toMatchObject({ label: 'Sin sugerencias', enabled: false })
  })

  it('en un campo editable ofrece cortar, copiar y pegar; fuera, solo copiar lo seleccionado', () => {
    expect(buildContextMenuTemplate(base, actions()).map((item) => item.role)).toContain('paste')
    expect(buildContextMenuTemplate({ ...base, isEditable: false, selectionText: 'algo' }, actions())).toEqual([
      { role: 'copy', label: 'Copiar' }
    ])
    expect(buildContextMenuTemplate({ ...base, isEditable: false }, actions())).toEqual([])
  })
})
