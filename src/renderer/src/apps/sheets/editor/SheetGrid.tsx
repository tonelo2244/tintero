import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { MAX_COLUMNS, MAX_ROWS, cellAddress, columnName } from '../model/address'
import { getCellValue, type Evaluation } from '../model/calc'
import { defaultAlignment, formatCellValue } from '../model/format'
import { selectionRange, type Selection } from '../model/selection'
import type { CellCoord, CellStyle, CellValue, Sheet } from '../model/types'
import { HEADER_HEIGHT, ROW_HEADER_WIDTH, ROW_HEIGHT } from '../constants'
import { columnMetrics } from './gridMetrics'

/** Filas y columnas extra que se pintan fuera de la vista, para que el scroll rápido no deje huecos. */
const OVERSCAN = 4
/** Hasta cuántas columnas vacías puede "desbordarse" un texto largo, como en Excel. */
const MAX_SPILL_COLUMNS = 12

interface SheetGridProps {
  sheet: Sheet
  evaluation: Evaluation
  selection: Selection
  /** Editor de celda (un <input>) que se coloca sobre la celda activa mientras se edita. */
  editor: ReactNode | null
  onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void
  /**
   * Pulsación sobre una celda. Devuelve true si la consumió el editor (modo "señalar": hacer clic
   * en una celda mientras se escribe una fórmula inserta su referencia).
   */
  onCellPointerDown(coord: CellCoord, extend: boolean): boolean
  onCellDrag(coord: CellCoord): void
  onCellDoubleClick(coord: CellCoord): void
  onSelect(selection: Selection): void
  onColumnResize(col: number, width: number): void
  viewportRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Cuadrícula virtualizada: aunque la hoja tenga 10.000 x 702 celdas, solo existen en el DOM las
 * que se ven (unas pocas centenas). Un div enorme y vacío da la barra de desplazamiento real; las
 * celdas visibles se colocan con position: absolute según el scroll.
 */
export function SheetGrid(props: SheetGridProps) {
  const { sheet, evaluation, selection, viewportRef } = props
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [size, setSize] = useState({ width: 800, height: 600 })
  const columns = useMemo(() => columnMetrics(sheet.columnWidths), [sheet.columnWidths])
  const dragging = useRef<'cells' | null>(null)

  // Tamaño de la vista: lo medimos y lo seguimos con ResizeObserver (la ventana puede cambiar).
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => setSize({ width: viewport.clientWidth, height: viewport.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [viewportRef])

  // Mantener visible la celda que se mueve con el teclado (o al arrastrar cerca del borde).
  const { row: focusRow, col: focusCol } = selection.focus
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const top = focusRow * ROW_HEIGHT
    const bottom = top + ROW_HEIGHT
    const left = columns.offsets[focusCol]
    const right = left + columns.width(focusCol)
    const visibleHeight = viewport.clientHeight - HEADER_HEIGHT
    const visibleWidth = viewport.clientWidth - ROW_HEADER_WIDTH
    if (top < viewport.scrollTop) viewport.scrollTop = top
    else if (bottom > viewport.scrollTop + visibleHeight) viewport.scrollTop = bottom - visibleHeight
    if (left < viewport.scrollLeft) viewport.scrollLeft = left
    else if (right > viewport.scrollLeft + visibleWidth) viewport.scrollLeft = right - visibleWidth
  }, [focusRow, focusCol, columns, viewportRef])

  // Qué filas y columnas caen dentro de la vista.
  const firstRow = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT) - OVERSCAN)
  const lastRow = Math.min(MAX_ROWS - 1, Math.ceil((scroll.top + size.height) / ROW_HEIGHT) + OVERSCAN)
  const firstCol = Math.max(0, columns.columnAt(scroll.left) - OVERSCAN)
  const lastCol = Math.min(MAX_COLUMNS - 1, columns.columnAt(scroll.left + size.width) + OVERSCAN)

  const coordFromPointer = (event: { clientX: number; clientY: number }): CellCoord => {
    const rect = viewportRef.current!.getBoundingClientRect()
    const x = event.clientX - rect.left + viewportRef.current!.scrollLeft - ROW_HEADER_WIDTH
    const y = event.clientY - rect.top + viewportRef.current!.scrollTop - HEADER_HEIGHT
    return {
      row: Math.min(MAX_ROWS - 1, Math.max(0, Math.floor(y / ROW_HEIGHT))),
      col: columns.columnAt(Math.max(0, x))
    }
  }

  const onCellsPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const coord = coordFromPointer(event)
    if (event.detail === 2) {
      event.preventDefault()
      props.onCellDoubleClick(coord)
      return
    }
    const consumed = props.onCellPointerDown(coord, event.shiftKey)
    // Si el clic lo usa el editor (modo señalar), el foco debe quedarse en el <input>.
    if (consumed) event.preventDefault()
    dragging.current = 'cells'
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onCellsPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current === 'cells') props.onCellDrag(coordFromPointer(event))
  }

  const range = selectionRange(selection)
  const rows: ReactNode[] = []
  for (let row = firstRow; row <= lastRow; row++) {
    rows.push(...renderRow(row))
  }

  function renderRow(row: number): ReactNode[] {
    const nodes: ReactNode[] = []
    let skipUntil = -1
    for (let col = firstCol; col <= lastCol; col++) {
      const address = cellAddress({ row, col })
      const cell = sheet.cells[address]
      const value = getCellValue(evaluation, sheet.id, address)
      const text = formatCellValue(value, cell?.style?.numberFormat)
      const align = cell?.style?.align ?? defaultAlignment(value)

      // Desbordamiento: un texto alineado a la izquierda se extiende sobre las celdas vacías de su
      // derecha. Esas celdas no se pintan; en su lugar va un "relleno" con la línea de la cuadrícula.
      // El relleno y los bordes de la celda NO se extienden: solo el texto, como en Excel.
      const ownWidth = columns.width(col)
      let textWidth = ownWidth
      if (typeof value === 'string' && align === 'left' && text !== '') {
        let next = col + 1
        while (next < MAX_COLUMNS && next - col <= MAX_SPILL_COLUMNS && isBlank(sheet, row, next)) {
          textWidth += columns.width(next)
          next++
        }
        if (next > col + 1) {
          skipUntil = next - 1
          nodes.push(
            <div
              key={`${address}-spill`}
              className="sheet-cell"
              style={{
                top: row * ROW_HEIGHT,
                left: columns.offsets[col + 1],
                width: textWidth - ownWidth,
                height: ROW_HEIGHT
              }}
            />
          )
        }
      } else if (col <= skipUntil && !cell) {
        // Celda vacía tapada por el texto desbordado de su izquierda: no hace falta pintarla.
        continue
      }

      nodes.push(
        <div
          key={address}
          className={`sheet-cell ${textWidth > ownWidth ? 'sheet-cell--spill' : ''}`}
          style={{
            top: row * ROW_HEIGHT,
            left: columns.offsets[col],
            width: ownWidth,
            height: ROW_HEIGHT,
            textAlign: align,
            ...cellCss(cell?.style, value)
          }}
        >
          {textWidth > ownWidth ? <span style={{ width: textWidth - 8 }}>{text}</span> : text}
        </div>
      )
    }
    return nodes
  }

  // Rectángulo de la selección y de la celda activa, en píxeles.
  const visibleRange = {
    start: range.start,
    end: { row: Math.min(range.end.row, MAX_ROWS - 1), col: Math.min(range.end.col, MAX_COLUMNS - 1) }
  }
  const selectionRect = {
    top: visibleRange.start.row * ROW_HEIGHT,
    left: columns.offsets[visibleRange.start.col],
    width: columns.offsets[visibleRange.end.col + 1] - columns.offsets[visibleRange.start.col],
    height: (visibleRange.end.row - visibleRange.start.row + 1) * ROW_HEIGHT
  }
  const anchor = selection.anchor
  const anchorRect = {
    top: anchor.row * ROW_HEIGHT,
    left: columns.offsets[anchor.col],
    width: columns.width(anchor.col),
    height: ROW_HEIGHT
  }

  const columnHeaders: ReactNode[] = []
  for (let col = firstCol; col <= lastCol; col++) {
    const selected = col >= range.start.col && col <= range.end.col
    columnHeaders.push(
      <div
        key={col}
        className={`sheet-header sheet-header--col ${selected ? 'is-selected' : ''}`}
        style={{ left: ROW_HEADER_WIDTH + columns.offsets[col], width: columns.width(col) }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          viewportRef.current?.focus()
          const start = event.shiftKey ? selection.anchor : { row: 0, col }
          props.onSelect({ anchor: { row: 0, col: start.col }, focus: { row: MAX_ROWS - 1, col } })
        }}
      >
        {columnName(col)}
        <ColumnResizeHandle width={columns.width(col)} onResize={(width) => props.onColumnResize(col, width)} />
      </div>
    )
  }

  const rowHeaders: ReactNode[] = []
  for (let row = firstRow; row <= lastRow; row++) {
    const selected = row >= range.start.row && row <= range.end.row
    rowHeaders.push(
      <div
        key={row}
        className={`sheet-header sheet-header--row ${selected ? 'is-selected' : ''}`}
        style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          viewportRef.current?.focus()
          const start = event.shiftKey ? selection.anchor : { row, col: 0 }
          props.onSelect({ anchor: { row: start.row, col: 0 }, focus: { row, col: MAX_COLUMNS - 1 } })
        }}
      >
        {row + 1}
      </div>
    )
  }

  const totalHeight = MAX_ROWS * ROW_HEIGHT
  return (
    <div
      ref={viewportRef}
      className="sheet-viewport"
      tabIndex={0}
      role="grid"
      aria-label={`Hoja ${sheet.name}`}
      aria-rowcount={MAX_ROWS}
      aria-colcount={MAX_COLUMNS}
      onKeyDown={props.onKeyDown}
      onScroll={(event) => setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft })}
    >
      <div
        className="sheet-canvas"
        style={{ width: columns.totalWidth + ROW_HEADER_WIDTH, height: totalHeight + HEADER_HEIGHT }}
      >
        <div className="sheet-column-headers" style={{ width: columns.totalWidth + ROW_HEADER_WIDTH }}>
          <div
            className="sheet-corner"
            title="Seleccionar toda la hoja"
            onPointerDown={(event) => {
              event.preventDefault()
              viewportRef.current?.focus()
              props.onSelect({ anchor: { row: 0, col: 0 }, focus: { row: MAX_ROWS - 1, col: MAX_COLUMNS - 1 } })
            }}
          />
          {columnHeaders}
        </div>
        <div className="sheet-row-headers" style={{ height: totalHeight }}>
          {rowHeaders}
        </div>
        <div
          className="sheet-cells"
          style={{ top: HEADER_HEIGHT, left: ROW_HEADER_WIDTH, width: columns.totalWidth, height: totalHeight }}
          onPointerDown={onCellsPointerDown}
          onPointerMove={onCellsPointerMove}
          onPointerUp={() => (dragging.current = null)}
          onPointerCancel={() => (dragging.current = null)}
        >
          {rows}
          <div className="sheet-selection" style={selectionRect} />
          <div className="sheet-active-cell" style={anchorRect} />
          {props.editor && (
            <div
              className="sheet-cell-editor"
              style={{ top: anchorRect.top, left: anchorRect.left, minWidth: anchorRect.width }}
            >
              {props.editor}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function isBlank(sheet: Sheet, row: number, col: number): boolean {
  const cell = sheet.cells[cellAddress({ row, col })]
  return !cell || (cell.value === undefined && cell.formula === undefined)
}

/** Formato de la celda -> CSS. Los bordes se pintan con sombras interiores para no mover el contenido. */
export function cellCss(style: CellStyle | undefined, value: CellValue): CSSProperties {
  const css: CSSProperties = {}
  if (style?.bold) css.fontWeight = 700
  if (style?.italic) css.fontStyle = 'italic'
  if (style?.underline) css.textDecoration = 'underline'
  if (style?.color) css.color = style.color
  else if (value !== null && typeof value === 'object') css.color = '#b3261e'
  if (style?.fill) css.background = style.fill
  const borders = style?.borders
  if (borders) {
    const shadows = [
      borders.top && 'inset 0 1px 0 #1f1f1f',
      borders.bottom && 'inset 0 -1px 0 #1f1f1f',
      borders.left && 'inset 1px 0 0 #1f1f1f',
      borders.right && 'inset -1px 0 0 #1f1f1f'
    ].filter(Boolean)
    if (shadows.length > 0) css.boxShadow = shadows.join(', ')
  }
  return css
}

/** Tirador del borde derecho de la cabecera: arrastrar cambia el ancho de la columna. */
function ColumnResizeHandle({ width, onResize }: { width: number; onResize(width: number): void }) {
  const start = useRef<{ x: number; width: number } | null>(null)
  return (
    <span
      className="sheet-resize-handle"
      onPointerDown={(event) => {
        event.stopPropagation()
        event.preventDefault()
        start.current = { x: event.clientX, width }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (start.current) onResize(start.current.width + event.clientX - start.current.x)
      }}
      onPointerUp={() => (start.current = null)}
    />
  )
}
