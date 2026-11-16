import { mergeAttributes, Node, type JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { SHAPE_PATHS } from '@/apps/slides/editor/ElementContent'
import type { ShapeKind } from '@/apps/slides/model/types'
import { normalizeRotation } from '../../model/floating'
import { objectView } from './ObjectView'
import { placementAttributes, sizeAttributes } from './placement'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shape: {
      /** Inserta una forma delante del párrafo del cursor (anclada a él) y la deja seleccionada. */
      insertShape: (kind: ShapeKind) => ReturnType
      /** Inserta un cuadro de texto delante del párrafo del cursor y pone el cursor dentro. */
      insertTextBox: () => ReturnType
    }
  }
}

export const SHAPE_KINDS = Object.keys(SHAPE_PATHS) as ShapeKind[]
export const DEFAULT_SHAPE_FILL = '#5b8bd0'
const SVG = 'http://www.w3.org/2000/svg'

/** Atributos de color (relleno y contorno); `null` es "sin". */
const colorAttribute = (name: string, fallback: string | null) => ({
  default: fallback,
  parseHTML: (element: HTMLElement) => element.getAttribute(`data-${name}`) ?? fallback,
  renderHTML: (attrs: Record<string, unknown>) => (attrs[name] ? { [`data-${name}`]: attrs[name] } : {})
})

const rotationAttribute = {
  default: 0,
  parseHTML: (element: HTMLElement) => normalizeRotation(Number(element.getAttribute('data-rotation')) || 0),
  renderHTML: (attrs: Record<string, unknown>) => (attrs.rotation ? { 'data-rotation': String(attrs.rotation) } : {})
}

/**
 * Forma (fase 16): las mismas formas SVG que Diapositivas (rectángulo, elipse, flecha, estrella...)
 * como objeto del documento, con relleno, contorno, tamaño, giro y ajuste de texto.
 */
export const Shape = Node.create({
  name: 'shape',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: {
        default: 'rect',
        parseHTML: (element) => {
          const kind = element.getAttribute('data-shape') as ShapeKind
          return SHAPE_KINDS.includes(kind) ? kind : 'rect'
        },
        renderHTML: (attrs) => ({ 'data-shape': attrs.kind })
      },
      fill: colorAttribute('fill', DEFAULT_SHAPE_FILL),
      stroke: colorAttribute('stroke', null),
      rotation: rotationAttribute,
      ...sizeAttributes(),
      ...placementAttributes()
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-shape]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'writer-shape' }), shapeSvgSpec(node)]
  },

  addNodeView() {
    return ({ node, getPos, editor }) =>
      objectView({
        editor,
        node,
        getPos,
        keepRatio: false,
        render: (current, body) => body.replaceChildren(shapeSvg(current)),
        naturalSize: () => ({ width: DEFAULT_SHAPE_SIZE.width, height: DEFAULT_SHAPE_SIZE.height })
      })
  },

  addCommands() {
    return {
      insertShape:
        (kind) =>
        ({ state, tr, dispatch }) => {
          const at = anchorPosition(state.selection.$from)
          const node = state.schema.nodes.shape.create({ kind, ...DEFAULT_SHAPE_SIZE })
          if (dispatch) {
            tr.insert(at, node)
            tr.setSelection(NodeSelection.create(tr.doc, at))
          }
          return true
        },
      insertTextBox:
        () =>
        ({ state, tr, dispatch }) => {
          const at = anchorPosition(state.selection.$from)
          const content: JSONContent = {
            type: 'textBox',
            attrs: { width: 240, wrap: 'square', align: 'right' },
            content: [{ type: 'paragraph' }]
          }
          if (dispatch) {
            tr.insert(at, state.schema.nodeFromJSON(content))
            tr.setSelection(TextSelection.create(tr.doc, at + 2))
          }
          return true
        }
    }
  }
})

export const DEFAULT_SHAPE_SIZE = { width: 160, height: 100 }

/**
 * Dónde va un objeto nuevo: delante del bloque de texto del cursor, como un objeto de Word va
 * anclado al párrafo. Así no parte el párrafo por la mitad y el texto de ese párrafo lo rodea.
 */
function anchorPosition($from: NodeSelection['$from']): number {
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).isTextblock) return $from.before(depth)
  }
  return $from.pos
}

function shapeSvg(node: ProseMirrorNode): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.classList.add('writer-shape__svg')
  const path = document.createElementNS(SVG, 'path')
  for (const [name, value] of Object.entries(shapePathAttributes(node))) path.setAttribute(name, value)
  svg.append(path)
  return svg
}

/** Lo mismo como especificación de ProseMirror (para el HTML que se copia). */
function shapeSvgSpec(node: ProseMirrorNode) {
  return [
    `${SVG} svg`,
    { viewBox: '0 0 100 100', preserveAspectRatio: 'none', class: 'writer-shape__svg' },
    [`${SVG} path`, shapePathAttributes(node)]
  ] as const
}

function shapePathAttributes(node: ProseMirrorNode): Record<string, string> {
  return {
    d: SHAPE_PATHS[node.attrs.kind as ShapeKind] ?? SHAPE_PATHS.rect,
    fill: node.attrs.fill ?? 'none',
    stroke: node.attrs.stroke ?? 'none',
    'stroke-width': '2',
    'vector-effect': 'non-scaling-stroke'
  }
}
