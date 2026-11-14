import { describe, expect, it } from 'vitest'
import { createShapeElement, createSlide } from './factories'
import { resizeBox, snapToCenter } from './geometry'
import { presentationReducer } from './presentationReducer'
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
    const next = presentationReducer(state, {
      type: 'element/setText',
      slideId: slide.id,
      elementId: title.id,
      text: 'Hola'
    })
    expect(next.slides[0].elements[0]).toMatchObject({ text: 'Hola' })
    expect(state.slides[0].elements[0]).toMatchObject({ text: '' })
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
