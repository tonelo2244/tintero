import { Node } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import {
  CAPTION_SEPARATOR,
  CAPTION_STYLE_ID,
  CROSS_REFERENCE,
  crossReferenceText,
  isCrossReferenceShow,
  newReferenceAnchor,
  SEQUENCE,
  type CrossReferenceShow
} from '../model/captions'
import { BOOKMARK } from '../model/links'
import { documentIndex, ensureReferenceAnchors, pageAt, registerPainter } from './references'
import { findBookmark } from './Bookmark'

export type CaptionPosition = 'above' | 'below'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    caption: {
      /**
       * Inserta un título ("Figura 3: texto") encima o debajo del objeto o la tabla seleccionados
       * (o del párrafo del cursor).
       */
      insertCaption: (options: { label: string; text: string; position: CaptionPosition }) => ReturnType
      /** Inserta una referencia cruzada al encabezado, título o marcador que empieza en `targetPos`. */
      insertCrossReference: (targetPos: number, show: CrossReferenceShow) => ReturnType
    }
  }
}

/**
 * Secuencia (el campo SEQ de Word): el número de un título. Solo guarda su rótulo ("Figura"); el
 * número es su orden entre las del mismo rótulo, y se repinta al cambiar el documento.
 */
export const Sequence = Node.create({
  name: SEQUENCE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      label: {
        default: 'Figura',
        parseHTML: (element) => element.getAttribute('data-sequence') || 'Figura',
        renderHTML: (attrs) => ({ 'data-sequence': attrs.label })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-sequence]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'writer-sequence' }]
  },

  addNodeView() {
    return ({ getPos, editor }) => {
      const dom = document.createElement('span')
      dom.className = 'writer-sequence'
      dom.contentEditable = 'false'
      const paint = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const text = String(documentIndex(editor.state.doc).sequences.get(pos) ?? 1)
        if (dom.textContent !== text) dom.textContent = text
      }
      paint()
      const unregister = registerPainter(paint)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== SEQUENCE) return false
          paint()
          return true
        },
        destroy: unregister,
        ignoreMutation: () => true
      }
    }
  },

  addCommands() {
    return {
      insertCaption:
        ({ label, text, position }) =>
        ({ state, tr, dispatch }) => {
          const block = captionAnchorBlock(state.selection)
          if (!block) return false
          if (dispatch) {
            const { schema } = state
            const anchor = newReferenceAnchor(documentIndex(state.doc).bookmarkNames)
            const content: ProseMirrorNode[] = [
              schema.nodes[BOOKMARK].create({ name: anchor }),
              schema.text(`${label} `),
              schema.nodes[SEQUENCE].create({ label })
            ]
            if (text.trim()) content.push(schema.text(`${CAPTION_SEPARATOR}${text.trim()}`))
            const paragraph = schema.nodes.paragraph.create({ blockStyle: CAPTION_STYLE_ID }, content)
            const at = position === 'above' ? block.pos : block.pos + block.node.nodeSize
            tr.insert(at, paragraph)
            // El cursor, al final del título: se sigue escribiendo en él, como en Word.
            tr.setSelection(TextSelection.create(tr.doc, at + paragraph.nodeSize - 1)).scrollIntoView()
          }
          return true
        },
      insertCrossReference:
        (targetPos, show) =>
        ({ state, tr, dispatch }) => {
          const target = documentIndex(state.doc).targets.find((candidate) => candidate.pos === targetPos)
          if (!target) return false
          if (dispatch) {
            const anchor =
              target.kind === 'bookmark'
                ? target.anchor
                : ensureReferenceAnchors(tr, state.doc, (candidate) => candidate.pos === targetPos).get(targetPos)
            const at = tr.mapping.map(state.selection.from)
            tr.insert(at, state.schema.nodes[CROSS_REFERENCE].create({ anchor, show }))
          }
          return true
        }
    }
  }
})

/**
 * Bloque al que se pone el título: el objeto o la tabla seleccionados, la tabla donde está el
 * cursor, o si no el bloque de primer nivel del cursor.
 */
function captionAnchorBlock(
  selection: import('@tiptap/pm/state').Selection
): { pos: number; node: ProseMirrorNode } | null {
  if (selection instanceof NodeSelection && selection.node.isBlock) {
    const $pos = selection.$from
    // Un objeto dentro de otro bloque: el título va junto a su bloque de primer nivel.
    if ($pos.depth === 0) return { pos: selection.from, node: selection.node }
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'table') return { pos: $from.before(depth), node: $from.node(depth) }
  }
  if ($from.depth === 0) return null
  return { pos: $from.before(1), node: $from.node(1) }
}

/**
 * Referencia cruzada (el REF/PAGEREF de Word): apunta a un marcador (el oculto de un encabezado o
 * un título, o uno con nombre) y escribe lo que se pidió de él: su texto, "Figura 3", su página o
 * "más arriba / más abajo". Se repinta sola; Ctrl/Cmd+clic lleva al destino.
 */
export const CrossReference = Node.create({
  name: CROSS_REFERENCE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      anchor: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-cross-ref') ?? '',
        renderHTML: (attrs) => ({ 'data-cross-ref': attrs.anchor })
      },
      show: {
        default: 'text',
        parseHTML: (element) => {
          const show = element.getAttribute('data-show')
          return isCrossReferenceShow(show) ? show : 'text'
        },
        renderHTML: (attrs) => ({ 'data-show': attrs.show })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-cross-ref]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'writer-cross-ref' }]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span')
      dom.className = 'writer-cross-ref'
      dom.contentEditable = 'false'
      dom.title = 'Referencia cruzada (Ctrl/Cmd+clic para ir)'
      let current = node
      const paint = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (pos === undefined) return
        const target = documentIndex(editor.state.doc).byAnchor.get(String(current.attrs.anchor)) ?? null
        const text = crossReferenceText(current.attrs.show as CrossReferenceShow, target, {
          referencePos: pos,
          page: target ? pageAt(editor.storage, target.pos) : 1
        })
        if (dom.textContent !== text) dom.textContent = text
        dom.classList.toggle('writer-cross-ref--broken', !target)
      }
      paint()
      const unregister = registerPainter(paint)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== CROSS_REFERENCE) return false
          current = updated
          paint()
          return true
        },
        destroy: unregister,
        ignoreMutation: () => true
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('crossReferenceClick'),
        props: {
          handleClickOn: (view, _pos, node, _nodePos, event) => {
            if (node.type.name !== CROSS_REFERENCE || !(event.metaKey || event.ctrlKey)) return false
            const pos = findBookmark(view.state.doc, String(node.attrs.anchor))
            if (pos === null) return true
            view.dispatch(
              view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))).scrollIntoView()
            )
            view.focus()
            return true
          }
        }
      })
    ]
  }
})
