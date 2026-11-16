import { describe, expect, it } from 'vitest'
import {
  arrangeZIndex,
  croppedImageBox,
  frameAfterCrop,
  normalizeCrop,
  normalizeRotation,
  placementOf,
  placementStyle,
  resizeKeepingRatio
} from './floating'

describe('colocación de objetos', () => {
  it('lee la colocación con valores por defecto', () => {
    expect(placementOf({})).toEqual({ wrap: 'inline', align: 'left', offsetX: 0, offsetY: 0, zIndex: 0 })
    expect(placementOf({ wrap: 'front', offsetX: 12.4, zIndex: 2.6, align: 'raro' })).toEqual({
      wrap: 'front',
      align: 'left',
      offsetX: 12.4,
      offsetY: 0,
      zIndex: 3
    })
  })

  it('cuadrado flota a su lado; centrado no puede flotar y va arriba y abajo', () => {
    const base = placementOf({ wrap: 'square' })
    expect(placementStyle({ ...base, align: 'right' }).float).toBe('right')
    expect(placementStyle({ ...base, align: 'left' }).float).toBe('left')
    expect(placementStyle({ ...base, align: 'center' })).toMatchObject({ display: 'block', margin: '6px auto' })
  })

  it('detrás y delante salen del flujo desde el ancla, con su orden', () => {
    const front = placementStyle(placementOf({ wrap: 'front', offsetX: 30, offsetY: -10, zIndex: 2 }))
    expect(front).toEqual({ position: 'absolute', 'margin-left': '30px', 'margin-top': '-10px', 'z-index': '3' })
    const behind = placementStyle(placementOf({ wrap: 'behind' }))
    expect(Number(behind['z-index'])).toBeLessThan(0)
    expect(placementStyle(placementOf({}))).toEqual({})
  })
})

describe('organizar', () => {
  it('adelante y atrás pasan al siguiente; al frente y al fondo, a todos', () => {
    expect(arrangeZIndex(0, [0, 1, 5], 'forward')).toBe(1)
    expect(arrangeZIndex(0, [2, 5], 'forward')).toBe(3)
    expect(arrangeZIndex(5, [0, 1], 'forward')).toBe(5)
    expect(arrangeZIndex(3, [0, 1, 5], 'backward')).toBe(0)
    expect(arrangeZIndex(0, [0, 1, 5], 'front')).toBe(6)
    expect(arrangeZIndex(0, [0, 1, 5], 'back')).toBe(-1)
    expect(arrangeZIndex(4, [], 'front')).toBe(4)
  })
})

describe('tamaño, giro y recorte', () => {
  it('con la proporción bloqueada, el otro lado sigue', () => {
    expect(resizeKeepingRatio({ width: 200, height: 100 }, { width: 100 }, true)).toEqual({ width: 100, height: 50 })
    expect(resizeKeepingRatio({ width: 200, height: 100 }, { height: 25 }, true)).toEqual({ width: 50, height: 25 })
    expect(resizeKeepingRatio({ width: 200, height: 100 }, { width: 100 }, false)).toEqual({ width: 100, height: 100 })
    expect(resizeKeepingRatio({ width: 200, height: 100 }, { width: -5 }, true).width).toBe(8)
  })

  it('normaliza el giro', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
  })

  it('limita el recorte para que siempre quede imagen', () => {
    expect(normalizeCrop({ left: 80, right: 50, top: -3 })).toEqual({ top: 0, right: 15, bottom: 0, left: 80 })
    expect(normalizeCrop('basura')).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('pinta la imagen entera dentro del marco recortado', () => {
    expect(croppedImageBox({ width: 75, height: 50 }, { top: 0, right: 25, bottom: 50, left: 0 })).toEqual({
      width: 100,
      height: 100,
      left: -0,
      top: -0
    })
    expect(croppedImageBox({ width: 50, height: 100 }, { top: 0, right: 25, bottom: 0, left: 25 }).left).toBe(-25)
  })

  it('recortar encoge el marco sin cambiar la escala, y quitarlo lo devuelve', () => {
    const none = normalizeCrop(null)
    const half = { top: 0, right: 50, bottom: 0, left: 0 }
    const frame = frameAfterCrop({ width: 200, height: 100 }, none, half)
    expect(frame).toEqual({ width: 100, height: 100 })
    expect(frameAfterCrop(frame, half, none)).toEqual({ width: 200, height: 100 })
  })
})
