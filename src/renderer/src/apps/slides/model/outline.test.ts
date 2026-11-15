import { describe, expect, it } from 'vitest'
import {
  buildOutlineRequest,
  countStreamedSlides,
  OUTLINE_LIMITS,
  parseOutline,
  presentationFromOutline
} from './outline'
import { plainText } from './richText'

const valid = {
  title: 'Plan de lanzamiento',
  subtitle: 'Q1 2027',
  slides: [
    { title: 'Objetivos', bullets: ['- Crecer un 20 %', 'Abrir dos mercados'], notes: 'Empezamos por el porqué.' },
    { title: 'Calendario', bullets: ['Enero: beta', 'Marzo: lanzamiento'], notes: '' }
  ]
}

describe('parseOutline', () => {
  it('acepta una respuesta correcta y limpia viñetas que el modelo añade por su cuenta', () => {
    const outline = parseOutline(valid)
    expect(outline.slides[0].bullets).toEqual(['Crecer un 20 %', 'Abrir dos mercados'])
  })

  it('da errores concretos para lo que el modelo puede corregir en un reintento', () => {
    expect(() => parseOutline([])).toThrow('objeto JSON')
    expect(() => parseOutline({ ...valid, title: ' ' })).toThrow('falta "title"')
    expect(() => parseOutline({ ...valid, slides: 'muchas' })).toThrow('"slides" debe ser una lista')
    expect(() => parseOutline({ ...valid, slides: [{ title: '', bullets: [] }] })).toThrow('al menos 2')
  })

  it('recorta los excesos en vez de rechazarlos', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      title: `Diapositiva ${index}`,
      bullets: Array.from({ length: 10 }, () => 'x'.repeat(500)),
      notes: ''
    }))
    const outline = parseOutline({ ...valid, slides: many })
    expect(outline.slides).toHaveLength(OUTLINE_LIMITS.maxSlides)
    expect(outline.slides[0].bullets).toHaveLength(OUTLINE_LIMITS.maxBullets)
    expect(outline.slides[0].bullets[0].length).toBe(OUTLINE_LIMITS.maxBulletChars)
  })
})

describe('presentationFromOutline', () => {
  it('crea portada y una diapositiva de título y contenido por punto, con sus notas', () => {
    const presentation = presentationFromOutline(parseOutline(valid))
    expect(presentation.slides.map((slide) => slide.layout)).toEqual(['title', 'titleContent', 'titleContent'])
    const texts = presentation.slides[1].elements.map((element) =>
      element.type === 'text' ? plainText(element.paragraphs) : ''
    )
    expect(texts).toEqual(['Objetivos', 'Crecer un 20 %\nAbrir dos mercados'])
    expect(presentation.slides[1].notes).toBe('Empezamos por el porqué.')
    const cover = presentation.slides[0].elements.map((element) =>
      element.type === 'text' ? plainText(element.paragraphs) : ''
    )
    expect(cover).toEqual(['Plan de lanzamiento', 'Q1 2027'])
  })
})

describe('buildOutlineRequest', () => {
  it('pide salida estructurada y marca el documento como datos', () => {
    const request = buildOutlineRequest('Texto')
    expect(request.jsonSchema).toMatchObject({ required: ['title', 'subtitle', 'slides'] })
    expect(request.messages[1].content).toBe('<documento>\nTexto\n</documento>')
  })
})

describe('countStreamedSlides', () => {
  it('cuenta las diapositivas ya empezadas en el JSON parcial', () => {
    expect(countStreamedSlides('{"title":"x","slides":[{"title":"a","bullets":["')).toBe(1)
    expect(countStreamedSlides('')).toBe(0)
  })
})
