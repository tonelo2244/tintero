import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { formatCm, orientedSize, type PageSetup } from '../model/pageSetup'
import type { TabStop } from '../model/paragraphFormat'
import { clampIndents, dragDeltaCm, rulerTicks, RULER_STEP_CM, snapCm, type ParagraphIndents } from '../model/ruler'

interface RulerProps {
  pageSetup: PageSetup
  /** Sangrías del párrafo donde está el cursor (null si no aplica, p. ej. en una tabla). */
  indents: ParagraphIndents | null
  zoom: number
  onMarginsChange(margins: { left: number; right: number }): void
  onIndentsChange(indents: ParagraphIndents): void
  /** Topes de tabulación del párrafo (fase 13): clic en la regla añade uno, clic en un tope lo quita. */
  tabStops: TabStop[]
  onTabStopsChange(stops: TabStop[]): void
  /** Px desde el borde izquierdo del lienzo: con secciones de distinto ancho, la hoja va centrada. */
  offset?: number
}

type Handle = 'marginLeft' | 'marginRight' | 'indentLeft' | 'firstLine'

interface Drag {
  handle: Handle
  startX: number
  /** Valores al empezar a arrastrar; el arrastre suma la distancia recorrida. */
  start: Values
}

interface Values {
  marginLeft: number
  marginRight: number
  indents: ParagraphIndents
}

/**
 * Regla horizontal sobre la hoja: muestra los márgenes (zona gris) y las sangrías del párrafo
 * actual. Arrastrar un margen cambia la configuración de página; arrastrar una sangría, el párrafo.
 * Mientras se arrastra solo se mueve la regla; el cambio se aplica al soltar (un único paso de
 * deshacer, y la paginación no se recalcula en cada píxel).
 *
 * Cada marca es también un `slider` accesible: con el foco, las flechas la mueven 0,25 cm.
 */
export function Ruler({
  offset = 0,
  pageSetup,
  indents,
  zoom,
  onMarginsChange,
  onIndentsChange,
  tabStops,
  onTabStopsChange
}: RulerProps) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const [preview, setPreview] = useState<Values | null>(null)
  /**
   * Último valor movido con el teclado mientras las props aún no lo reflejan: con las flechas
   * pulsadas seguidas, cada paso parte del anterior y no del valor que todavía no ha llegado.
   */
  const keyboardValue = useRef<Values | null>(null)
  const { width } = orientedSize(pageSetup)
  const contentWidth = (values: Values) => width - values.marginLeft - values.marginRight

  const committed: Values = {
    marginLeft: pageSetup.margins.left,
    marginRight: pageSetup.margins.right,
    indents: indents ?? { left: 0, firstLine: 0 }
  }
  const values = preview ?? committed

  /** Valores tras mover una marca `delta` centímetros (ya limitados a lo posible). */
  const moved = (handle: Handle, from: Values, delta: number): Values => {
    switch (handle) {
      case 'marginLeft':
        return { ...from, marginLeft: clampMargin(from.marginLeft + delta, width - from.marginRight) }
      case 'marginRight':
        return { ...from, marginRight: clampMargin(from.marginRight - delta, width - from.marginLeft) }
      case 'indentLeft':
        return {
          ...from,
          indents: clampIndents({ ...from.indents, left: from.indents.left + delta }, contentWidth(from))
        }
      case 'firstLine':
        return {
          ...from,
          indents: clampIndents({ ...from.indents, firstLine: from.indents.firstLine + delta }, contentWidth(from))
        }
    }
  }

  const commit = (handle: Handle, next: Values) => {
    if (handle === 'marginLeft' || handle === 'marginRight') {
      onMarginsChange({ left: next.marginLeft, right: next.marginRight })
    } else {
      onIndentsChange(next.indents)
    }
  }

  const startDrag = (handle: Handle) => (event: PointerEvent) => {
    event.preventDefault() // que el editor no pierda la selección
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ handle, startX: event.clientX, start: committed })
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return
    setPreview(moved(drag.handle, drag.start, dragDeltaCm(event.clientX - drag.startX, zoom)))
  }
  const onPointerUp = () => {
    if (drag && preview) commit(drag.handle, preview)
    setDrag(null)
    setPreview(null)
  }
  const onKeyDown = (handle: Handle) => (event: KeyboardEvent) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (direction === 0) return
    event.preventDefault()
    const pending = keyboardValue.current
    const from = pending && !sameValues(pending, committed) ? pending : committed
    const next = moved(handle, from, direction * RULER_STEP_CM)
    keyboardValue.current = next
    commit(handle, next)
  }

  const handleProps = (handle: Handle, label: string, valueCm: number) => ({
    role: 'slider',
    tabIndex: 0,
    'aria-label': label,
    'aria-valuenow': valueCm,
    'aria-valuetext': `${valueCm.toLocaleString('es-ES')} cm`,
    title: label,
    onPointerDown: startDrag(handle),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onKeyDown: onKeyDown(handle),
    // Sin foco, el valor puede cambiar por otro lado (otro párrafo): se vuelve a partir de las props.
    onBlur: () => {
      keyboardValue.current = null
    }
  })

  const textStart = values.marginLeft
  const textEnd = width - values.marginRight
  const leftIndentAt = textStart + values.indents.left
  const firstLineAt = leftIndentAt + values.indents.firstLine

  /** Como en Word: un clic en la zona de texto de la regla pone un tope izquierdo ahí. */
  const addTabStop = (event: MouseEvent<HTMLDivElement>) => {
    if (!indents || (event.target as HTMLElement).closest('[role="slider"], .writer-ruler__tab')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const position = snapCm(((event.clientX - rect.left) / rect.width) * width - values.marginLeft)
    if (position <= 0 || position >= contentWidth(values)) return
    if (tabStops.some((stop) => Math.abs(stop.position - position) < 0.01)) return
    const added: TabStop = { position, align: 'left' }
    onTabStopsChange([...tabStops, added].sort((a, b) => a.position - b.position))
  }

  return (
    <div
      className="writer-ruler"
      style={{ width: `${width}cm`, marginLeft: offset }}
      aria-label="Regla"
      role="group"
      onClick={addTabStop}
    >
      <div className="writer-ruler__margin" style={{ left: 0, width: `${textStart}cm` }} />
      <div className="writer-ruler__margin" style={{ left: `${textEnd}cm`, right: 0 }} />
      {rulerTicks(width, values.marginLeft).map((tick) => (
        <span
          key={tick.at}
          className={`writer-ruler__tick writer-ruler__tick--${tick.kind}`}
          style={{ left: `${tick.at}cm` }}
        >
          {tick.label !== undefined && tick.label !== 0 ? tick.label : null}
        </span>
      ))}
      <span
        className="writer-ruler__edge"
        style={{ left: `${textStart}cm` }}
        {...handleProps('marginLeft', 'Margen izquierdo', values.marginLeft)}
      />
      <span
        className="writer-ruler__edge"
        style={{ left: `${textEnd}cm` }}
        {...handleProps('marginRight', 'Margen derecho', values.marginRight)}
      />
      {indents && (
        <>
          <span
            className="writer-ruler__marker writer-ruler__marker--first"
            style={{ left: `${firstLineAt}cm` }}
            {...handleProps('firstLine', 'Sangría de primera línea', values.indents.firstLine)}
          />
          <span
            className="writer-ruler__marker writer-ruler__marker--left"
            style={{ left: `${leftIndentAt}cm` }}
            {...handleProps('indentLeft', 'Sangría izquierda', values.indents.left)}
          />
        </>
      )}
      {indents &&
        tabStops.map((stop) => (
          <button
            key={stop.position}
            type="button"
            className={`writer-ruler__tab writer-ruler__tab--${stop.align}`}
            style={{ left: `${textStart + stop.position}cm` }}
            title={`Tope ${TAB_LABELS[stop.align]} en ${formatCm(stop.position)} (clic para quitarlo)`}
            aria-label={`Quitar el tope de ${formatCm(stop.position)}`}
            onClick={() => onTabStopsChange(tabStops.filter((other) => other !== stop))}
          />
        ))}
      {drag && <div className="writer-ruler__guide" style={{ left: `${guideAt(drag.handle, values, width)}cm` }} />}
    </div>
  )
}

const TAB_LABELS: Record<TabStop['align'], string> = {
  left: 'izquierdo',
  center: 'centrado',
  right: 'derecho',
  decimal: 'decimal'
}

/** Un margen va de 0 a lo que deje 2 cm de texto (la misma regla que `withMargins`). */
function clampMargin(cm: number, available: number): number {
  return snapCm(Math.min(available - 2, Math.max(0, cm)))
}

function guideAt(handle: Handle, values: Values, width: number): number {
  switch (handle) {
    case 'marginLeft':
      return values.marginLeft
    case 'marginRight':
      return width - values.marginRight
    case 'indentLeft':
      return values.marginLeft + values.indents.left
    case 'firstLine':
      return values.marginLeft + values.indents.left + values.indents.firstLine
  }
}

function sameValues(a: Values, b: Values): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-6
  return (
    near(a.marginLeft, b.marginLeft) &&
    near(a.marginRight, b.marginRight) &&
    near(a.indents.left, b.indents.left) &&
    near(a.indents.firstLine, b.indents.firstLine)
  )
}
