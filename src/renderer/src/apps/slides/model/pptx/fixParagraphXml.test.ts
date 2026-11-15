import { describe, expect, it } from 'vitest'
import { addTransition, keepFirstParagraphProperties } from './fixParagraphXml'

describe('keepFirstParagraphProperties', () => {
  it('deja un solo <a:pPr> por párrafo, el primero', () => {
    const xml =
      '<a:p><a:pPr algn="l"><a:buNone/></a:pPr><a:r><a:t>a</a:t></a:r><a:pPr algn="l"><a:buNone/></a:pPr><a:r><a:t>b</a:t></a:r></a:p>'
    expect(keepFirstParagraphProperties(xml)).toBe(
      '<a:p><a:pPr algn="l"><a:buNone/></a:pPr><a:r><a:t>a</a:t></a:r><a:r><a:t>b</a:t></a:r></a:p>'
    )
  })

  it('trata cada párrafo por separado y respeta los <a:pPr/> vacíos', () => {
    const xml = '<a:p><a:pPr/><a:r/><a:pPr/></a:p><a:p><a:pPr algn="ctr"/><a:r/></a:p>'
    expect(keepFirstParagraphProperties(xml)).toBe('<a:p><a:pPr/><a:r/></a:p><a:p><a:pPr algn="ctr"/><a:r/></a:p>')
  })

  it('no toca un párrafo correcto', () => {
    const xml = '<a:p><a:pPr algn="r"/><a:r><a:t>ok</a:t></a:r></a:p>'
    expect(keepFirstParagraphProperties(xml)).toBe(xml)
  })
})

describe('addTransition', () => {
  it('pone la transición después del mapa de colores y no la repite', () => {
    const xml = '<p:sld><p:cSld/><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    const withFade = addTransition(xml, 'fade')
    expect(withFade).toBe(
      '<p:sld><p:cSld/><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr><p:transition spd="med"><p:fade/></p:transition></p:sld>'
    )
    expect(addTransition(withFade, 'push')).toBe(withFade)
    expect(addTransition(xml, 'none')).toBe(xml)
    expect(addTransition('<p:sld><p:cSld></p:cSld></p:sld>', 'push')).toContain('</p:cSld><p:transition')
  })
})
