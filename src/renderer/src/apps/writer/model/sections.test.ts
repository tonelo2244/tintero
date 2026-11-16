import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, withOrientation } from './pageSetup'
import { documentSections, hasSections, SECTION_BREAK } from './sections'

const landscape = withOrientation(DEFAULT_PAGE_SETUP, 'landscape')
const paragraph = { type: 'paragraph' }

describe('secciones', () => {
  it('sin saltos, todo es la sección del documento', () => {
    const { setups, sectionOf } = documentSections([paragraph, paragraph], DEFAULT_PAGE_SETUP)
    expect(setups).toEqual([DEFAULT_PAGE_SETUP])
    expect(sectionOf).toEqual([0, 0])
    expect(hasSections([paragraph])).toBe(false)
  })

  it('el salto guarda la hoja de la sección que empieza detrás de él', () => {
    const blocks = [paragraph, { type: SECTION_BREAK, attrs: { pageSetup: landscape } }, paragraph, paragraph]
    const { setups, sectionOf } = documentSections(blocks, DEFAULT_PAGE_SETUP)
    expect(setups).toEqual([DEFAULT_PAGE_SETUP, landscape])
    expect(sectionOf).toEqual([0, 1, 1, 1])
    expect(hasSections(blocks)).toBe(true)
  })

  it('un salto con la hoja dañada sigue con la de la sección anterior', () => {
    const blocks = [
      { type: SECTION_BREAK, attrs: { pageSetup: landscape } },
      { type: SECTION_BREAK, attrs: { pageSetup: { size: 'roto' } } }
    ]
    expect(documentSections(blocks, DEFAULT_PAGE_SETUP).setups).toEqual([DEFAULT_PAGE_SETUP, landscape, landscape])
  })
})
