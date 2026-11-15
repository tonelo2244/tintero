import { describe, expect, it } from 'vitest'
import {
  alignBoxes,
  boundingBox,
  cloneElement,
  distributeBoxes,
  flattenElements,
  groupElements,
  setElementBox,
  ungroupElement
} from './arrange'
import { createShapeElement, createTextElement } from './factories'
import { SLIDE_WIDTH, type GroupElement } from './types'

const shape = (x: number, y: number, width = 100, height = 50) => createShapeElement('rect', { x, y, width, height })

describe('alinear y distribuir', () => {
  it('con un solo elemento alinea respecto a la diapositiva', () => {
    const element = shape(10, 10)
    expect(alignBoxes([element], 'center')[element.id].x).toBe((SLIDE_WIDTH - 100) / 2)
    expect(alignBoxes([element], 'right')[element.id].x).toBe(SLIDE_WIDTH - 100)
  })

  it('con varios alinea respecto a la caja que los envuelve', () => {
    const a = shape(100, 0, 100)
    const b = shape(300, 200, 200)
    const left = alignBoxes([a, b], 'left')
    expect([left[a.id].x, left[b.id].x]).toEqual([100, 100])
    const right = alignBoxes([a, b], 'right')
    expect([right[a.id].x, right[b.id].x]).toEqual([400, 300])
    const bottom = alignBoxes([a, b], 'bottom')
    expect([bottom[a.id].y, bottom[b.id].y]).toEqual([200, 200])
  })

  it('reparte el hueco a partes iguales sin mover el primero ni el último', () => {
    const a = shape(0, 0, 100)
    const b = shape(150, 0, 50)
    const c = shape(500, 0, 100)
    const result = distributeBoxes([c, a, b], 'horizontal')
    // Hueco libre: 600 - 250 = 350, en dos espacios de 175.
    expect([result[a.id].x, result[b.id].x, result[c.id].x]).toEqual([0, 275, 500])
  })

  it('no distribuye con menos de tres', () => {
    expect(distributeBoxes([shape(0, 0), shape(300, 0)], 'horizontal')).toEqual({})
  })
})

describe('agrupar', () => {
  it('envuelve a los miembros y ocupa el sitio del más al fondo', () => {
    const back = shape(0, 0)
    const middle = shape(500, 500)
    const front = shape(200, 100, 100, 100)
    const elements = groupElements([back, middle, front], [back.id, front.id], 'g1')
    expect(elements.map((element) => element.id)).toEqual(['g1', middle.id])
    const group = elements[0] as GroupElement
    expect(group).toMatchObject({ type: 'group', x: 0, y: 0, width: 300, height: 200 })
    expect(group.children.map((child) => child.id)).toEqual([back.id, front.id])
  })

  it('no agrupa un solo elemento', () => {
    const elements = [shape(0, 0), shape(10, 10)]
    expect(groupElements(elements, [elements[0].id])).toBe(elements)
  })

  it('al mover o escalar el grupo, los hijos le siguen', () => {
    const a = shape(0, 0, 100, 100)
    const b = shape(100, 100, 100, 100)
    const real = groupElements([a, b], [a.id, b.id], 'g')[0] as GroupElement
    const moved = setElementBox(real, { x: 100, y: 50, width: 400, height: 400 }) as GroupElement
    expect(moved.children.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 100, y: 50, width: 200, height: 200 },
      { x: 300, y: 250, width: 200, height: 200 }
    ])
  })

  it('desagrupar devuelve los hijos en su sitio, con el giro del grupo', () => {
    const a = shape(0, 0)
    const b = shape(300, 0)
    const other = shape(0, 400)
    const grouped = groupElements([a, b, other], [a.id, b.id], 'g')
    const rotated = grouped.map((element) => (element.id === 'g' ? { ...element, rotation: 90 } : element))
    const ungrouped = ungroupElement(rotated, 'g')
    expect(ungrouped.map((element) => element.id)).toEqual([a.id, b.id, other.id])
    expect(ungrouped.map((element) => element.rotation ?? 0)).toEqual([90, 90, 0])
  })

  it('aplana los grupos anidados', () => {
    const a = shape(0, 0)
    const b = shape(200, 0)
    const c = shape(400, 0)
    const inner = groupElements([a, b, c], [a.id, b.id], 'inner')
    const outer = groupElements(inner, ['inner', c.id], 'outer')
    expect(flattenElements(outer).map((element) => element.id)).toEqual([a.id, b.id, c.id])
  })
})

describe('copiar', () => {
  it('da ids nuevos a la copia y a sus hijos y la desplaza', () => {
    const a = shape(0, 0)
    const text = createTextElement('free', { x: 50, y: 50, width: 100, height: 40 }, { text: 'hola' })
    const group = groupElements([a, text], [a.id, text.id], 'g')[0]
    const copy = cloneElement(group, 20) as GroupElement
    expect(copy.id).not.toBe('g')
    expect(copy.children.map((child) => child.id)).not.toContain(a.id)
    expect(copy.children.map((child) => [child.x, child.y])).toEqual([
      [20, 20],
      [70, 70]
    ])
    // Es una copia de verdad: cambiarla no toca la original.
    ;(copy.children[1] as typeof text).paragraphs[0].runs[0].text = 'adiós'
    expect(text.paragraphs[0].runs[0].text).toBe('hola')
  })

  it('la caja envolvente de nada es la diapositiva', () => {
    expect(boundingBox([])).toMatchObject({ x: 0, y: 0, width: SLIDE_WIDTH })
  })
})
