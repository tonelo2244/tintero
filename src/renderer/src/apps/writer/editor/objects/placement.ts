import type { Attributes } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { DEFAULT_PLACEMENT, placementOf, placementStyle, type ObjectPlacement } from '../../model/floating'

/**
 * Atributos de colocación comunes a todos los objetos (imagen, forma, cuadro de texto, gráfico).
 * En el HTML van como `data-wrap`, `data-align`... para que copiar y pegar dentro de Tintero los
 * conserve; el archivo .tdoc los guarda en el JSON como cualquier otro atributo.
 */
export function placementAttributes(): Attributes {
  const numberAttribute = (name: keyof ObjectPlacement) => ({
    default: DEFAULT_PLACEMENT[name],
    parseHTML: (element: HTMLElement) => Number(element.getAttribute(`data-${name.toLowerCase()}`)) || 0,
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs[name] ? { [`data-${name.toLowerCase()}`]: String(attrs[name]) } : {}
  })
  return {
    wrap: {
      default: DEFAULT_PLACEMENT.wrap,
      parseHTML: (element) => element.getAttribute('data-wrap') ?? DEFAULT_PLACEMENT.wrap,
      renderHTML: (attrs) => (attrs.wrap === DEFAULT_PLACEMENT.wrap ? {} : { 'data-wrap': attrs.wrap })
    },
    align: {
      default: DEFAULT_PLACEMENT.align,
      parseHTML: (element) => element.getAttribute('data-align') ?? DEFAULT_PLACEMENT.align,
      renderHTML: (attrs) => (attrs.align === DEFAULT_PLACEMENT.align ? {} : { 'data-align': attrs.align })
    },
    offsetX: numberAttribute('offsetX'),
    offsetY: numberAttribute('offsetY'),
    zIndex: numberAttribute('zIndex')
  }
}

/** Tamaño en px (ancho y alto); `null` es "el natural" (el de la imagen, o el de por defecto). */
export function sizeAttributes(): Attributes {
  const size = (name: 'width' | 'height') => ({
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value = Number(element.getAttribute(name) ?? parseFloat(element.style[name]))
      return Number.isFinite(value) && value > 0 ? Math.round(value) : null
    },
    renderHTML: (attrs: Record<string, unknown>) => (attrs[name] ? { [name]: String(attrs[name]) } : {})
  })
  return { width: size('width'), height: size('height') }
}

/** Estilo de colocación de un nodo como objeto `{ propiedad: valor }`. */
export const nodePlacementStyle = (node: ProseMirrorNode) => placementStyle(placementOf(node.attrs))
