import { describe, expect, it } from 'vitest'
import { displayNameFromPath, InvalidDocumentError, parseDocument, serializeDocument } from './document'

describe('document envelope', () => {
  it('serializa y vuelve a leer el mismo contenido', () => {
    const raw = serializeDocument('writer', { hello: 'world' }, new Date('2026-01-01T00:00:00Z'))
    const parsed = parseDocument(raw)
    expect(parsed.appId).toBe('writer')
    expect(parsed.content).toEqual({ hello: 'world' })
    expect(parsed.savedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('rechaza JSON corrupto', () => {
    expect(() => parseDocument('{nope')).toThrow(InvalidDocumentError)
  })

  it('rechaza archivos de otro formato', () => {
    expect(() => parseDocument(JSON.stringify({ foo: 1 }))).toThrow(/no pertenece/)
  })

  it('rechaza versiones futuras', () => {
    const raw = JSON.stringify({ format: 'tintero', version: 999, appId: 'writer', content: {} })
    expect(() => parseDocument(raw)).toThrow(/más nueva/)
  })

  it('obtiene el nombre visible desde rutas de cualquier sistema', () => {
    expect(displayNameFromPath('/Users/ana/Escritorio/informe.tdoc')).toBe('informe')
    expect(displayNameFromPath('C:\\docs\\notas.v2.tdoc')).toBe('notas.v2')
  })
})
