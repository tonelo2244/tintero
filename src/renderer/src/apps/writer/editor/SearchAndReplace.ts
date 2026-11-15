import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { findMatches, matchIndexAt, nextMatchIndex, type SearchOptions, type TextRange } from '../model/search'

/**
 * Buscar y reemplazar como extensión de Tiptap.
 *
 * - La búsqueda en sí es pura (model/search.ts).
 * - Aquí solo hay "pegamento": un plugin de ProseMirror que guarda la búsqueda activa, la recalcula
 *   cuando cambia el documento y pinta las coincidencias como decoraciones (no tocan el contenido,
 *   así que ni se guardan en el archivo ni ensucian el historial de deshacer).
 */

export interface SearchState {
  query: string
  options: SearchOptions
  matches: TextRange[]
  decorations: DecorationSet
}

export const searchPluginKey = new PluginKey<SearchState>('searchAndReplace')

const DEFAULT_OPTIONS: SearchOptions = { matchCase: false, wholeWord: false }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchAndReplace: {
      /** Define (o cambia) lo que se busca. Una cadena vacía apaga el resaltado. */
      setSearch: (query: string, options?: Partial<SearchOptions>) => ReturnType
      /** Selecciona la siguiente (1) o la anterior (-1) coincidencia y la hace visible. */
      goToMatch: (direction: 1 | -1) => ReturnType
      /** Reemplaza la coincidencia seleccionada y salta a la siguiente. Si no hay ninguna seleccionada, solo salta. */
      replaceMatch: (replacement: string) => ReturnType
      /** Reemplaza todas las coincidencias en un solo paso (un único "deshacer"). */
      replaceAllMatches: (replacement: string) => ReturnType
    }
  }
}

function buildState(doc: ProseMirrorNode, query: string, options: SearchOptions): SearchState {
  const matches = findMatches(doc, query, options)
  const decorations = DecorationSet.create(
    doc,
    matches.map((match) => Decoration.inline(match.from, match.to, { class: 'search-match' }))
  )
  return { query, options, matches, decorations }
}

export function getSearchState(state: EditorState): SearchState | undefined {
  return searchPluginKey.getState(state)
}

function selectMatch(tr: Transaction, match: TextRange): Transaction {
  return tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView()
}

export const SearchAndReplace = Extension.create({
  name: 'searchAndReplace',

  addCommands() {
    return {
      setSearch:
        (query, options = {}) =>
        ({ state, tr, dispatch }) => {
          const current = getSearchState(state)
          const merged = { ...(current?.options ?? DEFAULT_OPTIONS), ...options }
          if (dispatch) dispatch(tr.setMeta(searchPluginKey, { query, options: merged }))
          return true
        },

      goToMatch:
        (direction) =>
        ({ state, tr, dispatch }) => {
          const matches = getSearchState(state)?.matches ?? []
          if (matches.length === 0) return false
          const { selection } = state
          const current = matchIndexAt(matches, selection)
          const index =
            current === -1
              ? nextMatchIndex(matches, selection.from, direction)
              : (current + direction + matches.length) % matches.length
          if (dispatch) dispatch(selectMatch(tr, matches[index]))
          return true
        },

      replaceMatch:
        (replacement) =>
        ({ state, tr, dispatch, commands }) => {
          const search = getSearchState(state)
          if (!search || search.matches.length === 0) return false
          const index = matchIndexAt(search.matches, state.selection)
          if (index === -1) return commands.goToMatch(1)
          if (!dispatch) return true

          const { from, to } = search.matches[index]
          if (replacement) tr.insertText(replacement, from, to)
          else tr.delete(from, to)
          // Buscamos de nuevo en el documento ya modificado y saltamos a la siguiente.
          const remaining = findMatches(tr.doc, search.query, search.options)
          const next = nextMatchIndex(remaining, from + replacement.length, 1)
          if (next !== -1) selectMatch(tr, remaining[next])
          dispatch(tr)
          return true
        },

      replaceAllMatches:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const matches = getSearchState(state)?.matches ?? []
          if (matches.length === 0) return false
          if (dispatch) {
            // De atrás hacia delante: así las posiciones de las coincidencias pendientes no se mueven.
            for (const { from, to } of [...matches].reverse()) {
              if (replacement) tr.insertText(replacement, from, to)
              else tr.delete(from, to)
            }
            dispatch(tr)
          }
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchPluginKey,
        state: {
          init: (_config, state) => buildState(state.doc, '', DEFAULT_OPTIONS),
          apply(tr, previous) {
            const meta = tr.getMeta(searchPluginKey) as { query: string; options: SearchOptions } | undefined
            if (meta) return buildState(tr.doc, meta.query, meta.options)
            if (tr.docChanged && previous.query) return buildState(tr.doc, previous.query, previous.options)
            return previous
          }
        },
        props: {
          decorations(state) {
            const search = searchPluginKey.getState(state)
            if (!search || search.matches.length === 0) return null
            // La coincidencia seleccionada se pinta distinta, como "la actual" en Word.
            const current = search.matches[matchIndexAt(search.matches, state.selection)]
            return current
              ? search.decorations.add(state.doc, [
                  Decoration.inline(current.from, current.to, { class: 'search-match--current' })
                ])
              : search.decorations
          }
        }
      })
    ]
  }
})
