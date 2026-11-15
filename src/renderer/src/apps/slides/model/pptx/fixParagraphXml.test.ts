import { describe, expect, it } from 'vitest'
import { keepFirstParagraphProperties } from './fixParagraphXml'

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
