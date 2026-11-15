import { describe, expect, it } from 'vitest'
import { presentationFromOutline } from '../outline'
import { presentationReducer } from '../presentationReducer'
import { plainText } from '../richText'
import type { Presentation, TextElement } from '../types'
import { buildSlideAgentRequest, describePresentation, interpretSlideCalls } from './slideTools'

function sample(): Presentation {
  return presentationFromOutline({
    title: 'Plan de lanzamiento',
    subtitle: 'Equipo de producto',
    slides: [
      { title: 'Objetivos', bullets: ['Mil usuarios', 'Medir retención'], notes: 'Empezar por el porqué.' },
      { title: 'Calendario', bullets: ['Beta en marzo', 'Versión 1.0 en junio'], notes: '' }
    ]
  })
}

const apply = (presentation: Presentation, result: ReturnType<typeof interpretSlideCalls>) =>
  result.steps.flatMap((step) => step.actions).reduce(presentationReducer, presentation)

const titles = (presentation: Presentation) =>
  presentation.slides.map((slide) =>
    plainText((slide.elements.find((e) => e.type === 'text' && e.role === 'title') as TextElement).paragraphs)
  )

describe('describePresentation', () => {
  it('resume cada diapositiva con números desde 1, sin posiciones ni estilos', () => {
    const text = describePresentation(sample())
    expect(text).toContain('1. título «Plan de lanzamiento»; subtítulo: «Equipo de producto»')
    expect(text).toContain(
      '2. título «Objetivos»; puntos: «Mil usuarios» · «Medir retención»; notas: «Empezar por el porqué.»'
    )
    expect(text).toContain('Temas disponibles: blank (Blanco)')
  })

  it('el pedido viaja como datos y con las herramientas', () => {
    const request = buildSlideAgentRequest(sample(), 'añade conclusiones')
    expect(request.tools.map((tool) => tool.name)).toContain('add_slide')
    expect(request.messages[1].content).toContain('<peticion>\nañade conclusiones\n</peticion>')
  })
})

describe('interpretSlideCalls', () => {
  it('«pon en negrita los títulos y añade una diapositiva de conclusiones»', () => {
    const original = sample()
    const result = interpretSlideCalls(original, [
      { name: 'format_text', arguments: { slides: 'all', target: 'titles', bold: true } },
      { name: 'add_slide', arguments: { after: 3, title: 'Conclusiones', bullets: ['Lanzar en junio'] } }
    ])
    expect(result.problems).toEqual([])
    expect(result.steps.map((step) => step.label)).toEqual([
      'Poner negrita en los títulos de todas las diapositivas',
      'Añadir la diapositiva «Conclusiones» al final'
    ])
    const next = apply(original, result)
    expect(titles(next)).toEqual(['Plan de lanzamiento', 'Objetivos', 'Calendario', 'Conclusiones'])
    const firstTitle = next.slides[0].elements.find((e) => e.type === 'text' && e.role === 'title') as TextElement
    expect(firstTitle.style.bold).toBe(true)
    expect(original.slides).toHaveLength(3)
  })

  it('los números se refieren a la presentación original aunque se borre antes', () => {
    const original = sample()
    const result = interpretSlideCalls(original, [
      { name: 'delete_slide', arguments: { slide: 2 } },
      { name: 'set_slide_text', arguments: { slide: 3, title: 'Fechas' } },
      { name: 'add_slide', arguments: { after: 1, title: 'A' } },
      { name: 'add_slide', arguments: { after: 1, title: 'B' } }
    ])
    expect(result.problems).toEqual([])
    expect(titles(apply(original, result))).toEqual(['Plan de lanzamiento', 'A', 'B', 'Fechas'])
  })

  it('descarta lo inválido con un motivo que el modelo pueda corregir', () => {
    const result = interpretSlideCalls(sample(), [
      { name: 'delete_slide', arguments: { slide: 9 } },
      { name: 'set_theme', arguments: { theme: 'arcoiris' } },
      { name: 'format_text', arguments: { slides: 'all', target: 'titles', color: 'rojo' } },
      { name: 'delete_slide', arguments: { slide: 2 } },
      { name: 'set_notes', arguments: { slide: 2, notes: 'x' } },
      { name: 'hackear', arguments: {} }
    ])
    expect(result.steps).toHaveLength(1)
    expect(result.problems).toEqual([
      'delete_slide: la diapositiva 9 no existe (hay 3)',
      expect.stringMatching(/^set_theme: el tema "arcoiris" no existe; usa uno de: blank/),
      'format_text: "color" debe tener el formato #rrggbb',
      'set_notes: la diapositiva 2 ya se ha eliminado',
      'hackear: la herramienta "hackear" no existe'
    ])
  })
})
