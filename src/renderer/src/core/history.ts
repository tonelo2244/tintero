/**
 * Historial deshacer/rehacer genérico para cualquier reducer puro.
 * `coalesceKey` agrupa acciones seguidas (teclear, arrastrar) en un solo paso de deshacer.
 */
export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
  lastCoalesceKey: string | null
}

export type HistoryAction<A> =
  | { type: 'history/undo' }
  | { type: 'history/redo' }
  | { type: 'history/reset'; present: unknown }
  | { type: 'history/apply'; action: A; coalesceKey?: string }
  /**
   * Aplica la acción sin crear un paso de deshacer (p. ej. cambiar de hoja en un libro):
   * es un cambio que se guarda en el archivo pero que nadie espera "deshacer".
   */
  | { type: 'history/applyWithoutUndo'; action: A }
  /** Varias acciones como UN paso de deshacer (p. ej. los cambios que propone la IA). */
  | { type: 'history/applyBatch'; actions: A[] }

const MAX_HISTORY = 100

export function initHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], lastCoalesceKey: null }
}

export function withHistory<T, A>(reducer: (state: T, action: A) => T) {
  return function historyReducer(state: HistoryState<T>, action: HistoryAction<A>): HistoryState<T> {
    switch (action.type) {
      case 'history/undo': {
        if (state.past.length === 0) return state
        const previous = state.past[state.past.length - 1]
        return {
          past: state.past.slice(0, -1),
          present: previous,
          future: [state.present, ...state.future],
          lastCoalesceKey: null
        }
      }
      case 'history/redo': {
        if (state.future.length === 0) return state
        const [next, ...rest] = state.future
        return { past: [...state.past, state.present], present: next, future: rest, lastCoalesceKey: null }
      }
      case 'history/reset':
        return initHistory(action.present as T)
      case 'history/applyWithoutUndo': {
        const next = reducer(state.present, action.action)
        return next === state.present ? state : { ...state, present: next, lastCoalesceKey: null }
      }
      case 'history/applyBatch': {
        const next = action.actions.reduce(reducer, state.present)
        if (next === state.present) return state
        return {
          past: [...state.past, state.present].slice(-MAX_HISTORY),
          present: next,
          future: [],
          lastCoalesceKey: null
        }
      }
      case 'history/apply': {
        const next = reducer(state.present, action.action)
        if (next === state.present) return state
        const key = action.coalesceKey ?? null
        const shouldCoalesce = key !== null && key === state.lastCoalesceKey
        return {
          past: shouldCoalesce ? state.past : [...state.past, state.present].slice(-MAX_HISTORY),
          present: next,
          future: [],
          lastCoalesceKey: key
        }
      }
    }
  }
}
