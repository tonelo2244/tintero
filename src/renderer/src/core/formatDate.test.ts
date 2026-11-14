import { describe, expect, it } from 'vitest'
import { formatLastOpened } from './formatDate'

const now = new Date(2026, 10, 14, 10, 0) // sábado 14 nov 2026

describe('formatLastOpened', () => {
  it('hoy y ayer con hora', () => {
    expect(formatLastOpened(new Date(2026, 10, 14, 9, 5).toISOString(), now)).toBe('hoy, 9:05')
    expect(formatLastOpened(new Date(2026, 10, 13, 15, 47).toISOString(), now)).toBe('ayer, 15:47')
  })

  it('día de la semana dentro de la última semana', () => {
    expect(formatLastOpened(new Date(2026, 10, 9, 0, 20).toISOString(), now)).toBe('lun a las 0:20')
  })

  it('fecha corta para más antiguos', () => {
    expect(formatLastOpened(new Date(2026, 10, 2).toISOString(), now)).toBe('2 nov')
    expect(formatLastOpened(new Date(2024, 4, 20).toISOString(), now)).toBe('20 may 2024')
  })
})
