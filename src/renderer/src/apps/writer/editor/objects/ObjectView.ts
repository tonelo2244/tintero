import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { NodeView, ViewMutationRecord } from '@tiptap/pm/view'
import { isFreePlacement, placementOf, resizeKeepingRatio, styleText } from '../../model/floating'
import { nodePlacementStyle } from './placement'

interface ObjectViewOptions {
  editor: Editor
  node: ProseMirrorNode
  getPos: () => number | undefined
  /** Pinta el objeto dentro de su marco (la imagen, la forma, el gráfico). Sin él, el marco tiene contenido editable. */
  render?(node: ProseMirrorNode, body: HTMLElement): void
  /** Tamaño que tiene el objeto si su nodo no dice ninguno. */
  naturalSize(node: ProseMirrorNode, body: HTMLElement): { width: number; height: number }
  /** Al redimensionar, el alto sigue al ancho (imágenes y gráficos). */
  keepRatio: boolean
  /** Solo se cambia el ancho (el alto lo pone el contenido, como en un cuadro de texto). */
  widthOnly?: boolean
}

/**
 * Vista común de los objetos (fase 16): un marco con su colocación (en línea, cuadrado, detrás...)
 * y dos asas, una para cambiar el tamaño y otra, solo cuando el objeto va detrás o delante del
 * texto, para moverlo libremente. Mientras se arrastra solo cambia el estilo del marco; al soltar
 * se escribe una transacción (una sola entrada en Deshacer).
 *
 * Las medidas se guardan en px del documento: con zoom, el movimiento del ratón se divide por la
 * escala real del marco en pantalla.
 */
export function objectView(options: ObjectViewOptions): NodeView {
  const { editor, getPos } = options
  let node = options.node
  const dom = document.createElement('div')
  dom.className = 'writer-object'
  dom.setAttribute('data-type', node.type.name)
  const body = document.createElement('div')
  body.className = 'writer-object__body'
  const resizeHandle = handle('writer-object__handle writer-object__handle--resize', 'Cambiar el tamaño')
  const moveHandle = handle('writer-object__handle writer-object__handle--move', 'Mover')
  dom.append(body, resizeHandle, moveHandle)

  const paint = () => {
    const placement = placementOf(node.attrs)
    const style: Record<string, string> = { ...nodePlacementStyle(node) }
    if (node.attrs.width) style.width = `${node.attrs.width}px`
    if (node.attrs.height && !options.widthOnly) style.height = `${node.attrs.height}px`
    dom.setAttribute('style', styleText(style))
    dom.setAttribute('data-wrap', placement.wrap)
    moveHandle.hidden = !isFreePlacement(placement.wrap)
    // El giro es del objeto entero, asas incluidas, como en Word. El texto sigue rodeando la caja
    // sin girar (lo mismo que hace un navegador con `transform`).
    const rotation = Number(node.attrs.rotation) || 0
    if (rotation) dom.style.transform = `rotate(${rotation}deg)`
    options.render?.(node, body)
  }
  paint()

  const commit = (attrs: Record<string, unknown>) => {
    const pos = getPos()
    if (pos === undefined) return
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
    editor.view.dispatch(tr)
  }

  /** Arrastre con el puntero: `onMove` recibe el desplazamiento en px del documento. */
  const drag = (
    event: PointerEvent,
    onMove: (dx: number, dy: number) => void,
    onEnd: (dx: number, dy: number) => void
  ) => {
    event.preventDefault()
    event.stopPropagation()
    // La escala del zoom se mide en el editor entero: el marco puede estar girado.
    const root = editor.view.dom
    const scale = root.getBoundingClientRect().width / (root.offsetWidth || 1) || 1
    const start = { x: event.clientX, y: event.clientY }
    const delta = (current: PointerEvent) =>
      [(current.clientX - start.x) / scale, (current.clientY - start.y) / scale] as const
    const move = (current: PointerEvent) => onMove(...delta(current))
    const up = (current: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      dom.classList.remove('is-dragging')
      onEnd(...delta(current))
    }
    dom.classList.add('is-dragging')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  resizeHandle.addEventListener('pointerdown', (event) => {
    const start = node.attrs.width
      ? { width: Number(node.attrs.width), height: Number(node.attrs.height) || body.offsetHeight }
      : options.naturalSize(node, body)
    const sizeFor = (dx: number, dy: number) =>
      options.keepRatio
        ? resizeKeepingRatio(start, { width: start.width + dx }, true)
        : { width: Math.max(8, Math.round(start.width + dx)), height: Math.max(8, Math.round(start.height + dy)) }
    drag(
      event,
      (dx, dy) => {
        const size = sizeFor(dx, dy)
        dom.style.width = `${size.width}px`
        if (!options.widthOnly) dom.style.height = `${size.height}px`
      },
      (dx, dy) => {
        const size = sizeFor(dx, dy)
        commit(options.widthOnly ? { width: size.width } : size)
      }
    )
  })

  moveHandle.addEventListener('pointerdown', (event) => {
    const { offsetX, offsetY } = placementOf(node.attrs)
    drag(
      event,
      (dx, dy) => {
        dom.style.marginLeft = `${Math.round(offsetX + dx)}px`
        dom.style.marginTop = `${Math.round(offsetY + dy)}px`
      },
      (dx, dy) => commit({ offsetX: Math.round(offsetX + dx), offsetY: Math.round(offsetY + dy) })
    )
  })

  return {
    dom,
    contentDOM: options.render ? undefined : body,
    update: (updated) => {
      if (updated.type !== node.type) return false
      node = updated
      paint()
      return true
    },
    selectNode: () => dom.classList.add('is-selected'),
    deselectNode: () => dom.classList.remove('is-selected'),
    // Las asas son nuestras: ProseMirror no debe tratar esos clics como selección o arrastre.
    stopEvent: (event) =>
      event.target instanceof HTMLElement && event.target.classList.contains('writer-object__handle'),
    ignoreMutation: (mutation: ViewMutationRecord) => {
      // Con contenido editable, ProseMirror tiene que ver lo que pasa dentro; el resto es nuestro.
      if (options.render) return true
      if (mutation.type === 'selection') return false
      return !body.contains(mutation.target) || (mutation.type === 'attributes' && mutation.target === body)
    }
  }
}

function handle(className: string, title: string): HTMLElement {
  const element = document.createElement('span')
  element.className = className
  element.title = title
  element.contentEditable = 'false'
  element.setAttribute('aria-hidden', 'true')
  return element
}
