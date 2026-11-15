import { describe, expect, it } from 'vitest'
import { createAppRegistry, extensionOf, type AnyAppModule } from '@/core/appModule'
import { importNotice, openDialogFilters } from './fileFormats'

const app = (id: string, extension: string, importExtensions: string[] = []) =>
  ({
    id,
    file: { extension, label: `Archivos ${extension}` },
    importers: importExtensions.map((ext) => ({
      format: { extension: ext, label: `Formato ${ext}` },
      import: async () => ({ content: null, warnings: [] })
    }))
  }) as unknown as AnyAppModule

describe('formatos de archivo', () => {
  const registry = createAppRegistry([app('writer', 'tdoc', ['docx']), app('slides', 'tpres')])

  it('encuentra el importador por extensión, sin importar mayúsculas', () => {
    expect(registry.findImporter(extensionOf('/docs/Informe.DOCX'))?.app.id).toBe('writer')
    expect(registry.findImporter(extensionOf('/docs/informe.tdoc'))).toBeUndefined()
    expect(extensionOf('C:\\docs\\sin-extension')).toBe('')
  })

  it('no permite dos apps importando la misma extensión', () => {
    expect(() => createAppRegistry([app('a', 'x', ['docx']), app('b', 'y', ['docx'])])).toThrow(/docx/)
  })

  it('el primer filtro del diálogo incluye propios e importables', () => {
    const [all, tintero] = openDialogFilters(registry)
    expect(all.extensions).toEqual(['tdoc', 'tpres', 'docx'])
    expect(tintero.extensions).toEqual(['tdoc', 'tpres'])
  })

  it('el aviso de importación explica qué se perdió', () => {
    expect(importNotice('a.docx', 'tdoc', [])).toContain('el original no se modifica')
    expect(importNotice('a.docx', 'tdoc', ['1 tabla', 'la alineación de 2 párrafos'])).toContain(
      'No se han podido conservar: 1 tabla; la alineación de 2 párrafos.'
    )
  })
})
