import Image from '@tiptap/extension-image'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { croppedImageBox, hasCrop, normalizeCrop, normalizeRotation } from '../../model/floating'
import { objectView } from './ObjectView'
import { placementAttributes, sizeAttributes } from './placement'

/**
 * Imagen de verdad (fase 16): la de Tiptap más tamaño exacto, recorte, giro, texto alternativo y
 * ajuste de texto. Sigue siendo un bloque (como antes): un documento antiguo se abre igual, y
 * "En línea con el texto" es la imagen en su propio renglón, que es como se usaba.
 */
export const WriterImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...sizeAttributes(),
      rotation: {
        default: 0,
        parseHTML: (element) => normalizeRotation(Number(element.getAttribute('data-rotation')) || 0),
        renderHTML: (attrs) => (attrs.rotation ? { 'data-rotation': String(attrs.rotation) } : {})
      },
      crop: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-crop')
          if (!raw) return null
          try {
            const crop = normalizeCrop(JSON.parse(raw))
            return hasCrop(crop) ? crop : null
          } catch {
            return null
          }
        },
        renderHTML: (attrs) => (attrs.crop ? { 'data-crop': JSON.stringify(attrs.crop) } : {})
      },
      ...placementAttributes()
    }
  },

  addNodeView() {
    return ({ node, getPos, editor }) =>
      objectView({
        editor,
        node,
        getPos,
        keepRatio: true,
        render: paintImage,
        naturalSize: (_node, body) => {
          const image = body.querySelector('img')
          return { width: image?.offsetWidth || 200, height: image?.offsetHeight || 150 }
        }
      })
  }
})

/**
 * La imagen dentro de su marco. Sin recorte, la imagen llena el marco (o va a su tamaño natural,
 * hasta el ancho de la hoja). Con recorte, la imagen entera va dentro de una ventana que esconde
 * lo recortado (ver croppedImageBox).
 */
function paintImage(node: ProseMirrorNode, body: HTMLElement): void {
  let image = body.querySelector('img')
  if (!image) {
    image = document.createElement('img')
    image.draggable = false
    body.append(image)
  }
  if (image.getAttribute('src') !== node.attrs.src) image.src = node.attrs.src ?? ''
  image.alt = node.attrs.alt ?? ''
  if (node.attrs.title) image.title = node.attrs.title
  else image.removeAttribute('title')

  const crop = normalizeCrop(node.attrs.crop)
  const width = Number(node.attrs.width) || 0
  const height = Number(node.attrs.height) || 0
  body.classList.toggle('is-cropped', hasCrop(crop))
  if (hasCrop(crop) && width && height) {
    const box = croppedImageBox({ width, height }, crop)
    image.setAttribute(
      'style',
      `position: absolute; max-width: none; width: ${box.width}px; height: ${box.height}px; left: ${box.left}px; top: ${box.top}px;`
    )
  } else {
    image.setAttribute('style', width ? 'width: 100%; height: 100%;' : '')
  }
}
