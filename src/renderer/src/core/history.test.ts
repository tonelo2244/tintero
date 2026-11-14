import { describe, expect, it } from 'vitest'
import { initHistory, withHistory } from './history'

const counter = withHistory((state: number, action: { by: number }) => state + action.by)

describe('withHistory', () => {
  it('deshace y rehace', () => {
    let state = initHistory(0)
    state = counter(state, { type: 'history/apply', action: { by: 1 } })
    state = counter(state, { type: 'history/apply', action: { by: 2 } })
    expect(state.present).toBe(3)
    state = counter(state, { type: 'history/undo' })
    expect(state.present).toBe(1)
    state = counter(state, { type: 'history/redo' })
    expect(state.present).toBe(3)
  })

  it('agrupa acciones con la misma clave en un solo paso', () => {
    let state = initHistory(0)
    for (let i = 0; i < 5; i++) {
      state = counter(state, { type: 'history/apply', action: { by: 1 }, coalesceKey: 'typing' })
    }
    expect(state.present).toBe(5)
    state = counter(state, { type: 'history/undo' })
    expect(state.present).toBe(0)
  })

  it('una acción nueva borra el "rehacer"', () => {
    let state = initHistory(0)
    state = counter(state, { type: 'history/apply', action: { by: 1 } })
    state = counter(state, { type: 'history/undo' })
    state = counter(state, { type: 'history/apply', action: { by: 10 } })
    expect(state.future).toHaveLength(0)
    expect(state.present).toBe(10)
  })
})
