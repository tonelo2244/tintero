import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { TabStop } from '../model/paragraphFormat'
import { PX_PER_CM } from '../model/ruler'
import { layoutTabs, type MeasuredTab } from '../model/tabs'

const tabStopsKey = new PluginKey<DecorationSet>('tabStops')

/**
 * Ancho real de cada tabulador. Igual que la paginación: se quitan los anchos, se mide dónde cae
 * cada tabulador y cuánto mide el texto que lo sigue, `layoutTabs` (lógica pura) decide y el
 * resultado se aplica como decoración (no toca el documento). Después se pide a la paginación que
 * vuelva a repartir, porque un tabulador puede hacer que un párrafo ocupe una línea más.
 */
export const TabStops = Extension.create({
  name: 'tabStops',

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin<DecorationSet>({
        key: tabStopsKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, decorations) => tr.getMeta(tabStopsKey) ?? decorations.map(tr.mapping, tr.doc)
        },
        props: { decorations: (state) => tabStopsKey.getState(state) },
        view: (view) => {
          let frame = 0
          const schedule = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
              if (view.composing) return schedule()
              if (layout(view)) editor.storage.pagination?.requestLayout?.()
            })
          }
          const resize = new ResizeObserver(schedule)
          resize.observe(view.dom)
          schedule()
          return {
            update: (current, previous) => {
              if (!current.state.doc.eq(previous.doc)) schedule()
            },
            destroy: () => {
              cancelAnimationFrame(frame)
              resize.disconnect()
            }
          }
        }
      })
    ]
  }
})

interface TabBlock {
  stops: TabStop[]
  tabs: { pos: number; segmentEnd: number; decimalAt: number | null }[]
}

/** Párrafos con tabuladores, cada uno con sus topes y, por tabulador, dónde acaba su texto. */
function collectBlocks(doc: ProseMirrorNode): TabBlock[] {
  const blocks: TabBlock[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const tabs: TabBlock['tabs'] = []
    node.forEach((child, offset) => {
      if (child.type.name === 'tab') tabs.push({ pos: pos + 1 + offset, segmentEnd: 0, decimalAt: null })
    })
    if (tabs.length === 0) return false
    const end = pos + node.nodeSize - 1
    tabs.forEach((tab, index) => {
      tab.segmentEnd = index + 1 < tabs.length ? tabs[index + 1].pos : end
      const text = doc.textBetween(tab.pos + 1, tab.segmentEnd, '\n', '\t')
      const decimal = text.search(/[.,]\d/)
      tab.decimalAt = decimal >= 0 ? tab.pos + 1 + decimal : null
    })
    blocks.push({ stops: (node.attrs.tabStops as TabStop[] | null) ?? [], tabs })
    return false
  })
  return blocks
}

/** Mide y aplica. Devuelve si cambió algo (para avisar a la paginación). */
function layout(view: EditorView): boolean {
  const blocks = collectBlocks(view.state.doc)
  const had = tabStopsKey.getState(view.state) !== DecorationSet.empty
  if (blocks.length === 0 && !had) return false
  if (had) view.dispatch(view.state.tr.setMeta(tabStopsKey, DecorationSet.empty).setMeta('addToHistory', false))

  const origin = view.dom.getBoundingClientRect()
  const scale = view.dom.offsetWidth > 0 ? origin.width / view.dom.offsetWidth : 1
  const toCm = (px: number) => px / scale / PX_PER_CM
  const lineWidth = toCm(origin.width)
  const decorations: Decoration[] = []

  for (const block of blocks) {
    let previous: Rect | null = null
    /** Lo que ya ocupan en pantalla los tabuladores anteriores de la línea (su ancho por defecto). */
    let renderedShift = 0
    const measured: MeasuredTab[] = block.tabs.map((tab) => {
      const start = view.coordsAtPos(tab.pos)
      const after = view.coordsAtPos(tab.pos + 1)
      const segmentEnd = view.coordsAtPos(tab.segmentEnd)
      const newLine = previous !== null && !onSameLine(previous, start)
      if (newLine) renderedShift = 0
      previous = start
      // `layoutTabs` razona con tabuladores de ancho 0: se descuenta lo que miden ahora.
      const ownWidth = onSameLine(start, after) ? Math.max(0, after.left - start.left) : 0
      const x = start.left - origin.left - renderedShift
      renderedShift += ownWidth
      const segmentWidth = onSameLine(after, segmentEnd) ? segmentEnd.left - after.left : origin.right - after.left
      const decimal = tab.decimalAt !== null ? view.coordsAtPos(tab.decimalAt) : null
      return {
        x: toCm(x),
        segmentWidth: toCm(segmentWidth),
        decimalOffset: decimal && onSameLine(after, decimal) ? toCm(decimal.left - after.left) : toCm(segmentWidth),
        newLine
      }
    })
    layoutTabs(measured, block.stops, lineWidth).forEach(({ width, dotted }, index) => {
      const pos = block.tabs[index].pos
      decorations.push(
        Decoration.node(pos, pos + 1, {
          style: `width: ${width.toFixed(3)}cm`,
          class: dotted ? 'writer-tab writer-tab--dotted' : 'writer-tab'
        })
      )
    })
  }

  view.dispatch(
    view.state.tr.setMeta(tabStopsKey, DecorationSet.create(view.state.doc, decorations)).setMeta('addToHistory', false)
  )
  return true
}

type Rect = { top: number; bottom: number }

/**
 * ¿Dos posiciones en la misma línea? Se mira si se solapan en vertical, no si tienen el mismo
 * `top`: un tabulador es un hueco sin texto y su caja no empieza a la altura de las letras.
 */
function onSameLine(a: Rect, b: Rect): boolean {
  return a.top <= b.bottom + 1 && b.top <= a.bottom + 1
}
