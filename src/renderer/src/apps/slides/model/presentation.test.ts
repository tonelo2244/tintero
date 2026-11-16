import { describe, expect, it } from 'vitest'
import { migrateSlideV1toV2, parsePresentation } from './content'
import { createShapeElement, createSlide, createTableElement, createTextElement } from './factories'
import { resizeBox, snapToCenter } from './geometry'
import { presentationReducer } from './presentationReducer'
import { IMPORTED_THEME_ID, presentationTheme, SLIDE_THEMES } from './themes'
import type { Presentation } from './types'

function deck(count: number): Presentation {
  return { themeId: 'blank', slides: Array.from({ length: count }, () => createSlide('title')) }
}

describe('presentationReducer', () => {
  it('añade una diapositiva en la posición indicada', () => {
    const state = deck(2)
    const slide = createSlide('blank')
    const next = presentationReducer(state, { type: 'slide/add', slide, index: 1 })
    expect(next.slides.map((item) => item.id)).toEqual([state.slides[0].id, slide.id, state.slides[1].id])
  })

  it('nunca deja la presentación sin diapositivas', () => {
    const state = deck(1)
    expect(presentationReducer(state, { type: 'slide/delete', slideId: state.slides[0].id })).toBe(state)
  })

  it('mueve diapositivas', () => {
    const state = deck(3)
    const next = presentationReducer(state, { type: 'slide/move', from: 0, to: 2 })
    expect(next.slides[2].id).toBe(state.slides[0].id)
  })

  it('cambia el texto sin mutar el estado anterior', () => {
    const state = deck(1)
    const slide = state.slides[0]
    const title = slide.elements[0]
    const paragraphs = [{ runs: [{ text: 'Hola' }] }]
    const next = presentationReducer(state, {
      type: 'element/setParagraphs',
      slideId: slide.id,
      elementId: title.id,
      paragraphs
    })
    expect(next.slides[0].elements[0]).toMatchObject({ paragraphs })
    expect(state.slides[0].elements[0]).toMatchObject({ paragraphs: [] })
  })

  it('el formato aplicado al cuadro entero anula ese formato en las palabras', () => {
    const slide = createSlide('blank')
    const box = createTextElement(
      'free',
      { x: 0, y: 0, width: 100, height: 100 },
      {
        paragraphs: [
          {
            runs: [
              { text: 'a', bold: false, italic: true },
              { text: 'b', bold: true }
            ]
          }
        ]
      }
    )
    slide.elements = [box]
    const next = presentationReducer(
      { themeId: 'blank', slides: [slide] },
      { type: 'element/setTextStyle', slideId: slide.id, elementId: box.id, style: { bold: true } }
    )
    expect(next.slides[0].elements[0]).toMatchObject({
      style: { bold: true },
      paragraphs: [{ runs: [{ text: 'a', italic: true }, { text: 'b' }] }]
    })
  })

  it('trae al frente y envía al fondo', () => {
    const state = deck(1)
    const slideId = state.slides[0].id
    const shape = createShapeElement('rect')
    let next = presentationReducer(state, { type: 'element/add', slideId, element: shape })
    next = presentationReducer(next, { type: 'element/reorder', slideId, elementId: shape.id, direction: 'back' })
    expect(next.slides[0].elements[0].id).toBe(shape.id)
  })

  it('devuelve el mismo objeto si la acción no cambia nada (para no ensuciar el historial)', () => {
    const state = deck(1)
    expect(presentationReducer(state, { type: 'presentation/setTheme', themeId: 'blank' })).toBe(state)
  })
})

describe('geometry', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 }

  it('redimensiona desde la esquina superior izquierda', () => {
    expect(resizeBox(box, 'nw', -50, -20)).toEqual({ x: 50, y: 80, width: 250, height: 120 })
  })

  it('mantiene la proporción cuando se pide', () => {
    const result = resizeBox(box, 'se', 200, 0, true)
    expect(result.width / result.height).toBeCloseTo(2)
  })

  it('respeta un tamaño mínimo', () => {
    expect(resizeBox(box, 'e', -1000, 0).width).toBe(20)
  })

  it('imanta al centro de la diapositiva', () => {
    const result = snapToCenter({ x: 535, y: 10, width: 200, height: 100 })
    expect(result.box.x).toBe(540)
    expect(result.guides).toEqual({ vertical: true, horizontal: false })
  })
})

describe('migración de archivos antiguos', () => {
  it('versión 1 -> 2: el texto plano pasa a párrafos', () => {
    const slide = createSlide('title')
    const legacy = {
      ...slide,
      elements: slide.elements.map((element, index) => {
        const { paragraphs: _ignored, ...rest } = element as typeof element & { paragraphs: unknown }
        return { ...rest, text: index === 0 ? 'Título\nen dos líneas' : '' }
      })
    }
    const migrated = migrateSlideV1toV2(legacy as unknown as typeof slide)
    expect(migrated.elements[0]).not.toHaveProperty('text')
    expect(migrated.elements[0]).toMatchObject({
      paragraphs: [{ runs: [{ text: 'Título' }] }, { runs: [{ text: 'en dos líneas' }] }]
    })
    expect(migrated.elements[1]).toMatchObject({ paragraphs: [] })
  })

  it('solo migra si el archivo viene de una versión anterior', () => {
    const slide = createSlide('title')
    const current = parsePresentation({ themeId: 'blank', slides: [slide] }, 2)
    expect(current.slides[0]).toBe(slide)
  })
})

describe('fase 10: giro, tablas y tema importado', () => {
  it('normaliza el giro y lo quita al volver a 0', () => {
    const slide = createSlide('blank')
    const shape = createShapeElement('rect')
    slide.elements = [shape]
    let state: Presentation = { themeId: 'blank', slides: [slide] }
    state = presentationReducer(state, {
      type: 'element/setRotation',
      slideId: slide.id,
      elementId: shape.id,
      rotation: -15
    })
    expect(state.slides[0].elements[0].rotation).toBe(345)
    state = presentationReducer(state, {
      type: 'element/setRotation',
      slideId: slide.id,
      elementId: shape.id,
      rotation: 360
    })
    expect('rotation' in state.slides[0].elements[0]).toBe(false)
  })

  it('edita una celda de tabla', () => {
    const slide = createSlide('blank')
    const table = createTableElement(2, 3)
    slide.elements = [table]
    const state = presentationReducer(
      { themeId: 'blank', slides: [slide] },
      { type: 'table/setCell', slideId: slide.id, elementId: table.id, row: 1, col: 2, cell: { text: 'hola' } }
    )
    const edited = state.slides[0].elements[0]
    expect(edited.type === 'table' && edited.rows[1][2].text).toBe('hola')
  })

  it('al cambiar a un tema de la galería, las diapositivas dejan su fondo importado', () => {
    const importedTheme = { ...SLIDE_THEMES[0], id: IMPORTED_THEME_ID, name: 'Importado' }
    const slide = { ...createSlide('blank'), background: '#123456' }
    const start: Presentation = { themeId: IMPORTED_THEME_ID, slides: [slide], importedTheme }
    expect(presentationTheme(start)).toBe(importedTheme)
    const changed = presentationReducer(start, { type: 'presentation/setTheme', themeId: 'bosque' })
    expect(changed.slides[0].background).toBeUndefined()
    expect(presentationTheme(changed).id).toBe('bosque')
    expect(parsePresentation(JSON.parse(JSON.stringify(start)), 2).importedTheme).toEqual(importedTheme)
  })
})

describe('fase 11: varios elementos, grupos y transiciones', () => {
  const setup = () => {
    const slide = createSlide('blank')
    const a = createShapeElement('rect', { x: 0, y: 0, width: 100, height: 100 })
    const b = createShapeElement('ellipse', { x: 200, y: 0, width: 100, height: 100 })
    slide.elements = [a, b]
    return { state: { themeId: 'blank', slides: [slide] } as Presentation, slide, a, b }
  }

  it('mueve, borra y añade varios a la vez', () => {
    const { state, slide, a, b } = setup()
    const moved = presentationReducer(state, {
      type: 'elements/setBoxes',
      slideId: slide.id,
      boxes: { [a.id]: { x: 10, y: 10, width: 100, height: 100 }, [b.id]: { x: 210, y: 10, width: 100, height: 100 } }
    })
    expect(moved.slides[0].elements.map((element) => [element.x, element.y])).toEqual([
      [10, 10],
      [210, 10]
    ])
    const deleted = presentationReducer(moved, { type: 'elements/delete', slideId: slide.id, elementIds: [a.id, b.id] })
    expect(deleted.slides[0].elements).toEqual([])
    const added = presentationReducer(deleted, { type: 'elements/add', slideId: slide.id, elements: [a] })
    expect(added.slides[0].elements).toEqual([a])
  })

  it('agrupa y desagrupa', () => {
    const { state, slide, a, b } = setup()
    const grouped = presentationReducer(state, {
      type: 'elements/group',
      slideId: slide.id,
      elementIds: [a.id, b.id],
      groupId: 'g'
    })
    expect(grouped.slides[0].elements).toMatchObject([{ id: 'g', type: 'group', x: 0, width: 300 }])
    // Mover el grupo mueve a sus hijos.
    const moved = presentationReducer(grouped, {
      type: 'element/setBox',
      slideId: slide.id,
      elementId: 'g',
      box: { x: 100, y: 100, width: 300, height: 100 }
    })
    const ungrouped = presentationReducer(moved, { type: 'elements/ungroup', slideId: slide.id, groupId: 'g' })
    expect(ungrouped.slides[0].elements.map((element) => [element.id, element.x, element.y])).toEqual([
      [a.id, 100, 100],
      [b.id, 300, 100]
    ])
  })

  it('guarda la transición solo si no es "ninguna"', () => {
    const { state, slide } = setup()
    const fade = presentationReducer(state, { type: 'slide/setTransition', slideId: slide.id, transition: 'fade' })
    expect(fade.slides[0].transition).toBe('fade')
    const none = presentationReducer(fade, { type: 'slide/setTransition', slideId: slide.id, transition: 'none' })
    expect('transition' in none.slides[0]).toBe(false)
  })

  it('aplicar alineación al cuadro borra la de cada párrafo', () => {
    const slide = createSlide('blank')
    const text = createTextElement('free', { x: 0, y: 0, width: 100, height: 40 })
    text.paragraphs = [
      { runs: [{ text: 'a' }], align: 'right' },
      { runs: [{ text: 'b' }], bullets: true }
    ]
    slide.elements = [text]
    const state = presentationReducer(
      { themeId: 'blank', slides: [slide] },
      { type: 'element/setTextStyle', slideId: slide.id, elementId: text.id, style: { align: 'center' } }
    )
    const edited = state.slides[0].elements[0]
    expect(edited.type === 'text' && edited.paragraphs).toEqual([
      { runs: [{ text: 'a' }] },
      { runs: [{ text: 'b' }], bullets: true }
    ])
  })
})
