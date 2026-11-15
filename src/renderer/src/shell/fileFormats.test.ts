import { describe, expect, it } from 'vitest'
import { createAppRegistry, extensionOf, type AnyAppModule } from '@/core/appModule'
import { importNotice, openDialogFilters, planOpen } from './fileFormats'

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

  describe('planOpen: qué hacer con un archivo antes de leerlo', () => {
    it('abre tal cual los archivos propios, sin importar mayúsculas', () => {
      expect(planOpen(registry, '/Users/ana/Desktop/Documento1.tdoc').kind).toBe('native')
      expect(planOpen(registry, 'C:\\docs\\Charla.TPRES').kind).toBe('native')
    })

    it('importa los formatos de otras suites', () => {
      const plan = planOpen(registry, '/docs/informe.docx')
      expect(plan.kind).toBe('import')
      if (plan.kind === 'import') expect(plan.app.id).toBe('writer')
    })

    // El fallo original: un archivo ajeno se leía como .tdoc y el aviso hablaba de "JSON corrupto".
    it('rechaza otros tipos con un mensaje claro, sin leerlos como si fueran de Tintero', () => {
      const plan = planOpen(registry, '/Users/ana/Desktop/notas.txt')
      expect(plan).toEqual({
        kind: 'unsupported',
        message: 'Tintero no sabe abrir archivos .txt. Puede abrir .tdoc, .tpres y .docx.'
      })
      expect(plan.kind === 'unsupported' && plan.message).not.toMatch(/JSON/)
    })

    it('explica también los archivos sin extensión', () => {
      const plan = planOpen(registry, '/Users/ana/Desktop/Documento1')
      expect(plan.kind === 'unsupported' && plan.message).toMatch(/^Tintero no sabe abrir archivos sin extensión\./)
    })
  })
})
