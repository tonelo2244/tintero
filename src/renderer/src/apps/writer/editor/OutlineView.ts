import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { hasSectionBody, hiddenBlocks } from '../model/outline'
import { documentOutline } from '../model/outlineEdits'

declare module '@tiptap/core' {
  interface Storage {
    outlineView: OutlineViewState
  }
  interface Commands<ReturnType> {
    outlineView: {
      /** Enciende o apaga la vista Esquema (triángulos para plegar y viñetas de nivel). */
      setOutlineView: (enabled: boolean) => ReturnType
      /** Pliega o despliega el título que empieza en `pos`. */
      toggleOutlineFold: (pos: number) => ReturnType
      /** Pliega o despliega todos los títulos que tienen algo debajo. */
      setOutlineFoldAll: (collapsed: boolean) => ReturnType
      /** "Mostrar nivel": solo títulos hasta ese nivel; `null` lo enseña todo. */
      setOutlineLevel: (level: number | null) => ReturnType
    }
  }
}

export interface OutlineViewState {
  enabled: boolean
  /** Posiciones de los títulos plegados (se recolocan con cada cambio del documento). */
  collapsed: number[]
  showLevel: number | null
}

const INITIAL: OutlineViewState = { enabled: false, collapsed: [], showLevel: null }
export const outlineViewKey = new PluginKey<OutlineViewState>('outlineView')

export const outlineViewState = (state: EditorState): OutlineViewState => outlineViewKey.getState(state) ?? INITIAL

/**
 * Vista Esquema de Word: el mismo documento, con un triángulo delante de cada título para plegar su
 * sección y la opción de ver solo hasta cierto nivel. Plegar es cosa de la vista: no toca el
 * documento ni el historial (se hace con decoraciones, como la paginación). Qué bloques se esconden
 * lo decide `hiddenBlocks` (model/outline.ts), que es lógica pura.
 */
export const OutlineView = Extension.create<object, OutlineViewState>({
  name: 'outlineView',

  // Copia del estado del plugin para quien no tiene el `EditorState` a mano (el registro de comandos).
  addStorage() {
    return { ...INITIAL }
  },

  onTransaction() {
    Object.assign(this.storage, outlineViewState(this.editor.state))
  },

  addCommands() {
    const update =
      (change: (current: OutlineViewState, state: EditorState) => OutlineViewState) =>
      () =>
      ({ state, dispatch }: { state: EditorState; dispatch?: (tr: EditorState['tr']) => void }) => {
        if (dispatch) {
          const next = change(outlineViewState(state), state)
          dispatch(state.tr.setMeta(outlineViewKey, next).setMeta('addToHistory', false))
        }
        return true
      }
    return {
      setOutlineView: (enabled) => update((current) => ({ ...current, enabled }))(),
      toggleOutlineFold: (pos) => update((current) => withFoldToggled(current, pos))(),
      setOutlineFoldAll: (collapsed) =>
        update((current, state) => {
          if (!collapsed) return { ...current, collapsed: [] }
          const { blocks, positions } = documentOutline(state.doc)
          return { ...current, collapsed: positions.filter((_, index) => hasSectionBody(blocks, index)) }
        })(),
      setOutlineLevel: (level) => update((current) => ({ ...current, showLevel: level }))()
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<OutlineViewState>({
        key: outlineViewKey,
        state: {
          init: () => INITIAL,
          apply: (tr, value) => {
            const next = (tr.getMeta(outlineViewKey) as OutlineViewState | undefined) ?? value
            if (!tr.docChanged || next.collapsed.length === 0) return next
            // Los títulos plegados siguen a su texto; si un título desaparece, deja de estar plegado.
            const collapsed = next.collapsed.flatMap((pos) => {
              const mapped = tr.mapping.mapResult(pos, 1)
              return mapped.deleted || tr.doc.nodeAt(mapped.pos)?.type.name !== 'heading' ? [] : [mapped.pos]
            })
            return { ...next, collapsed }
          }
        },
        props: {
          decorations: (state) => {
            const view = outlineViewState(state)
            if (!view.enabled) return null
            const { blocks, positions } = documentOutline(state.doc)
            const collapsedIndexes = new Set(
              view.collapsed.map((pos) => positions.indexOf(pos)).filter((index) => index >= 0)
            )
            const hidden = hiddenBlocks(blocks, collapsedIndexes, view.showLevel)
            const decorations: Decoration[] = []
            blocks.forEach((block, index) => {
              const from = positions[index]
              const to = positions[index + 1]
              const classes = [
                'writer-outline-block',
                block.level ? `writer-outline-block--h${block.level}` : 'writer-outline-block--body'
              ]
              if (hidden[index]) classes.push('writer-outline-hidden')
              decorations.push(Decoration.node(from, to, { class: classes.join(' ') }))
              if (block.level !== null && !hidden[index]) {
                const folded = collapsedIndexes.has(index)
                const expandable = hasSectionBody(blocks, index)
                decorations.push(
                  Decoration.widget(from + 1, () => foldToggle(from, folded, expandable), {
                    side: -1,
                    key: `fold-${from}-${folded}-${expandable}`,
                    ignoreSelection: true
                  })
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = (event.target as HTMLElement).closest<HTMLElement>('[data-outline-toggle]')
              if (!target) return false
              event.preventDefault()
              const next = withFoldToggled(outlineViewState(view.state), Number(target.dataset.outlineToggle))
              view.dispatch(view.state.tr.setMeta(outlineViewKey, next).setMeta('addToHistory', false))
              return true
            }
          }
        }
      })
    ]
  }
})

const withFoldToggled = (current: OutlineViewState, pos: number): OutlineViewState => ({
  ...current,
  collapsed: current.collapsed.includes(pos)
    ? current.collapsed.filter((value) => value !== pos)
    : [...current.collapsed, pos]
})

/** El triángulo de plegar: un elemento fuera del texto (no se puede escribir dentro ni se copia). */
function foldToggle(pos: number, folded: boolean, expandable: boolean): HTMLElement {
  const toggle = document.createElement('span')
  toggle.contentEditable = 'false'
  toggle.className = `writer-outline-toggle${folded ? ' is-folded' : ''}${expandable ? '' : ' is-empty'}`
  if (expandable) {
    toggle.dataset.outlineToggle = String(pos)
    toggle.title = folded ? 'Desplegar' : 'Plegar'
    toggle.setAttribute('role', 'button')
    toggle.setAttribute('aria-label', folded ? 'Desplegar sección' : 'Plegar sección')
  }
  return toggle
}
