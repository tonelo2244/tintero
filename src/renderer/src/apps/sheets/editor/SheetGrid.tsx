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
import { ChevronDown } from 'lucide-react'
import { MAX_COLUMNS, MAX_ROWS, cellAddress, columnName } from '../model/address'
import { getCellValue, type Evaluation } from '../model/calc'
import { defaultAlignment, formatCellValue } from '../model/format'
import { mergeIndex } from '../model/merges'
import { selectionRange, type Selection } from '../model/selection'
import { cssFontFamilyFor } from '@/ui/fonts'
import type { CellCoord, CellRange, CellStyle, CellValue, Sheet } from '../model/types'
import { HEADER_HEIGHT, ROW_HEADER_WIDTH, ROW_HEIGHT } from '../constants'
import { columnMetrics, rowMetrics } from './gridMetrics'

/** Filas y columnas extra que se pintan fuera de la vista, para que el scroll rápido no deje huecos. */
const OVERSCAN = 4
/** Hasta cuántas columnas vacías puede "desbordarse" un texto largo, como en Excel. */
const MAX_SPILL_COLUMNS = 12
const NO_HIDDEN_ROWS: ReadonlySet<number> = new Set()

interface SheetGridProps {
  sheet: Sheet
  evaluation: Evaluation
  selection: Selection
  /** Editor de celda (un <input>) que se coloca sobre la celda activa mientras se edita. */
  editor: ReactNode | null
  /** Filas ocultas por el filtro. */
  hiddenRows?: ReadonlySet<number>
  /** Formato condicional: lo que se añade al formato propio de la celda. */
  conditionalStyle?(address: string, value: CellValue): Partial<CellStyle> | undefined
  /** Columnas con botón de filtro, en la fila de cabecera del autofiltro. */
  filterButtons?: { row: number; cols: number[]; active: ReadonlySet<number> } | null
  onOpenFilter?(col: number, anchor: DOMRect): void
  /** Lo que flota sobre las celdas y se desplaza con ellas (los gráficos). */
  overlay?: ReactNode
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
  onRowResize(row: number, height: number): void
  viewportRef: React.RefObject<HTMLDivElement | null>
}

/** Una de las cuatro zonas de la cuadrícula con paneles inmovilizados. */
interface Region {
  rows: [number, number]
  cols: [number, number]
}

/**
 * Cuadrícula virtualizada: aunque la hoja tenga 10.000 x 702 celdas, solo existen en el DOM las
 * que se ven (unas pocas centenas). Un div enorme y vacío da la barra de desplazamiento real; las
 * celdas visibles se colocan con position: absolute según el scroll.
 *
 * Paneles inmovilizados: las filas y columnas fijas van en capas con `position: sticky` dentro del
 * mismo lienzo, así el navegador las mantiene en su sitio sin esperar a React (no "tiemblan" al
 * desplazar). Cada capa pinta sus celdas y su trozo de la selección.
 */
export function SheetGrid(props: SheetGridProps) {
  const { sheet, evaluation, selection, viewportRef } = props
  const hiddenRows = props.hiddenRows ?? NO_HIDDEN_ROWS
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [size, setSize] = useState({ width: 800, height: 600 })
  const columns = useMemo(() => columnMetrics(sheet.columnWidths), [sheet.columnWidths])
  const rowsMetrics = useMemo(() => rowMetrics(sheet.rowHeights, hiddenRows), [sheet.rowHeights, hiddenRows])
  const merges = useMemo(() => mergeIndex(sheet), [sheet])
  const dragging = useRef<'cells' | null>(null)

  const frozenRows = Math.min(sheet.frozen?.rows ?? 0, MAX_ROWS - 1)
  const frozenCols = Math.min(sheet.frozen?.cols ?? 0, MAX_COLUMNS - 1)
  const frozenHeight = rowsMetrics.offsets[frozenRows]
  const frozenWidth = columns.offsets[frozenCols]

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
  // Las filas y columnas inmovilizadas siempre se ven; las demás no deben quedar debajo de ellas.
  const { row: focusRow, col: focusCol } = selection.focus
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const visibleHeight = viewport.clientHeight - HEADER_HEIGHT
    const visibleWidth = viewport.clientWidth - ROW_HEADER_WIDTH
    if (focusRow >= frozenRows) {
      const top = rowsMetrics.offsets[focusRow]
      const bottom = top + rowsMetrics.size(focusRow)
      if (top - frozenHeight < viewport.scrollTop) viewport.scrollTop = top - frozenHeight
      else if (bottom > viewport.scrollTop + visibleHeight) viewport.scrollTop = bottom - visibleHeight
    }
    if (focusCol >= frozenCols) {
      const left = columns.offsets[focusCol]
      const right = left + columns.size(focusCol)
      if (left - frozenWidth < viewport.scrollLeft) viewport.scrollLeft = left - frozenWidth
      else if (right > viewport.scrollLeft + visibleWidth) viewport.scrollLeft = right - visibleWidth
    }
  }, [focusRow, focusCol, columns, rowsMetrics, viewportRef, frozenRows, frozenCols, frozenHeight, frozenWidth])

  // Qué filas y columnas caen dentro de la vista (en la zona que se desplaza).
  const scrollRows: [number, number] = [
    Math.max(frozenRows, rowsMetrics.indexAt(scroll.top + frozenHeight) - OVERSCAN),
    Math.min(MAX_ROWS - 1, rowsMetrics.indexAt(scroll.top + size.height) + OVERSCAN)
  ]
  const scrollCols: [number, number] = [
    Math.max(frozenCols, columns.indexAt(scroll.left + frozenWidth) - OVERSCAN),
    Math.min(MAX_COLUMNS - 1, columns.indexAt(scroll.left + size.width) + OVERSCAN)
  ]
  const fixedRows: [number, number] = [0, frozenRows - 1]
  const fixedCols: [number, number] = [0, frozenCols - 1]

  /** Celda bajo el puntero. Dentro de un panel inmovilizado no se suma el desplazamiento. */
  const coordFromPointer = (event: { clientX: number; clientY: number }): CellCoord => {
    const viewport = viewportRef.current!
    const rect = viewport.getBoundingClientRect()
    const x = event.clientX - rect.left - ROW_HEADER_WIDTH
    const y = event.clientY - rect.top - HEADER_HEIGHT
    const gridX = x < frozenWidth ? x : x + viewport.scrollLeft
    const gridY = y < frozenHeight ? y : y + viewport.scrollTop
    return {
      row: Math.min(MAX_ROWS - 1, rowsMetrics.indexAt(Math.max(0, gridY))),
      col: columns.indexAt(Math.max(0, gridX))
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
  const rectOf = (target: CellRange) => ({
    top: rowsMetrics.offsets[target.start.row],
    left: columns.offsets[target.start.col],
    width: columns.offsets[target.end.col + 1] - columns.offsets[target.start.col],
    height: rowsMetrics.offsets[target.end.row + 1] - rowsMetrics.offsets[target.start.row]
  })

  // ---------- Celdas de una zona ----------

  function renderCell(row: number, col: number, width: number, height: number, spillWidth: number): ReactNode {
    const address = cellAddress({ row, col })
    const cell = sheet.cells[address]
    const value = getCellValue(evaluation, sheet.id, address)
    const conditional = props.conditionalStyle?.(address, value)
    const style = conditional ? { ...cell?.style, ...conditional } : cell?.style
    const text = formatCellValue(value, style?.numberFormat)
    const spill = spillWidth > width
    const wrap = style?.wrap === true
    const filterCol = props.filterButtons?.row === row && props.filterButtons.cols.includes(col)
    return (
      <div
        key={address}
        className={`sheet-cell ${spill ? 'sheet-cell--spill' : ''} ${wrap ? 'sheet-cell--wrap' : ''}`}
        style={{
          top: rowsMetrics.offsets[row],
          left: columns.offsets[col],
          width,
          height,
          textAlign: style?.align ?? defaultAlignment(value),
          // El texto de una línea va abajo, como en Excel, aunque la fila sea más alta.
          ...(height > ROW_HEIGHT && !wrap ? { paddingTop: height - ROW_HEIGHT } : {}),
          ...cellCss(style, value)
        }}
      >
        {spill ? <span style={{ width: spillWidth - 8 }}>{text}</span> : text}
        {filterCol && (
          <button
            type="button"
            className={`sheet-filter-button ${props.filterButtons!.active.has(col) ? 'is-active' : ''}`}
            aria-label={`Filtrar la columna ${columnName(col)}`}
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
              props.onOpenFilter?.(col, event.currentTarget.getBoundingClientRect())
            }}
          >
            <ChevronDown size={12} />
          </button>
        )}
      </div>
    )
  }

  function renderRegion(region: Region): ReactNode[] {
    const nodes: ReactNode[] = []
    const [firstRow, lastRow] = region.rows
    const [firstCol, lastCol] = region.cols
    const drawnMerges = new Set<CellRange>()

    for (let row = firstRow; row <= lastRow; row++) {
      const height = rowsMetrics.size(row)
      if (height === 0) continue
      let skipUntil = -1
      for (let col = firstCol; col <= lastCol; col++) {
        const address = cellAddress({ row, col })
        const merge = merges.get(address)
        if (merge) {
          // Una combinada se pinta una vez, como una celda grande, aunque empiece fuera de la vista.
          if (drawnMerges.has(merge)) continue
          drawnMerges.add(merge)
          const rect = rectOf(merge)
          nodes.push(renderCell(merge.start.row, merge.start.col, rect.width, rect.height, rect.width))
          continue
        }
        if (col <= skipUntil && !sheet.cells[address]) continue

        // Desbordamiento: un texto alineado a la izquierda se extiende sobre las celdas vacías de su
        // derecha. Esas celdas no se pintan; en su lugar va un "relleno" con la línea de la cuadrícula.
        const cell = sheet.cells[address]
        const value = getCellValue(evaluation, sheet.id, address)
        const align = cell?.style?.align ?? defaultAlignment(value)
        const ownWidth = columns.size(col)
        let textWidth = ownWidth
        if (typeof value === 'string' && value !== '' && align === 'left' && !cell?.style?.wrap) {
          let next = col + 1
          while (
            next <= lastCol &&
            next - col <= MAX_SPILL_COLUMNS &&
            isBlank(sheet, row, next) &&
            !merges.has(cellAddress({ row, col: next }))
          ) {
            textWidth += columns.size(next)
            next++
          }
          if (next > col + 1) {
            skipUntil = next - 1
            nodes.push(
              <div
                key={`${address}-spill`}
                className="sheet-cell"
                style={{
                  top: rowsMetrics.offsets[row],
                  left: columns.offsets[col + 1],
                  width: textWidth - ownWidth,
                  height
                }}
              />
            )
          }
        }
        nodes.push(renderCell(row, col, ownWidth, height, textWidth))
      }
    }
    return nodes
  }

  // ---------- Selección ----------

  const anchor = selection.anchor
  const anchorMerge = merges.get(cellAddress(anchor))
  const visibleRange = {
    start: range.start,
    end: { row: Math.min(range.end.row, MAX_ROWS - 1), col: Math.min(range.end.col, MAX_COLUMNS - 1) }
  }
  const selectionRect = rectOf(visibleRange)
  const anchorRect = rectOf(anchorMerge ?? { start: anchor, end: anchor })
  // El editor va en la zona de la celda activa, para que se quede quieto con ella al desplazar.
  const anchorRow = anchor.row < frozenRows ? fixedRows : scrollRows
  const anchorCol = anchor.col < frozenCols ? fixedCols : scrollCols

  const selectionLayer = (region: Region) => (
    <>
      <div className="sheet-selection" style={selectionRect} />
      <div className="sheet-active-cell" style={anchorRect} />
      {props.editor && region.rows === anchorRow && region.cols === anchorCol && (
        <div
          className="sheet-cell-editor"
          style={{ top: anchorRect.top, left: anchorRect.left, minWidth: anchorRect.width }}
        >
          {props.editor}
        </div>
      )}
    </>
  )

  // ---------- Cabeceras ----------

  const columnHeader = (col: number) => {
    const selected = col >= range.start.col && col <= range.end.col
    return (
      <div
        key={col}
        className={`sheet-header sheet-header--col ${selected ? 'is-selected' : ''}`}
        style={{ left: ROW_HEADER_WIDTH + columns.offsets[col], width: columns.size(col) }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          viewportRef.current?.focus()
          const start = event.shiftKey ? selection.anchor : { row: 0, col }
          props.onSelect({ anchor: { row: 0, col: start.col }, focus: { row: MAX_ROWS - 1, col } })
        }}
      >
        {columnName(col)}
        <ResizeHandle
          axis="column"
          size={columns.size(col)}
          min={24}
          onResize={(width) => props.onColumnResize(col, width)}
        />
      </div>
    )
  }

  const rowHeader = (row: number) => {
    const height = rowsMetrics.size(row)
    if (height === 0) return null
    const selected = row >= range.start.row && row <= range.end.row
    return (
      <div
        key={row}
        className={`sheet-header sheet-header--row ${selected ? 'is-selected' : ''}`}
        style={{ top: rowsMetrics.offsets[row], height }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          viewportRef.current?.focus()
          const start = event.shiftKey ? selection.anchor : { row, col: 0 }
          props.onSelect({ anchor: { row: start.row, col: 0 }, focus: { row, col: MAX_COLUMNS - 1 } })
        }}
      >
        {row + 1}
        <ResizeHandle axis="row" size={height} min={8} onResize={(next) => props.onRowResize(row, next)} />
      </div>
    )
  }

  const indices = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
  const totalHeight = rowsMetrics.total
  const totalWidth = columns.total

  const mainRegion: Region = { rows: scrollRows, cols: scrollCols }
  const topRegion: Region = { rows: fixedRows, cols: scrollCols }
  const leftRegion: Region = { rows: scrollRows, cols: fixedCols }
  const cornerRegion: Region = { rows: fixedRows, cols: fixedCols }

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
        style={{ width: totalWidth + ROW_HEADER_WIDTH, height: totalHeight + HEADER_HEIGHT }}
      >
        <div className="sheet-column-headers" style={{ width: totalWidth + ROW_HEADER_WIDTH }}>
          {/* La esquina y las cabeceras de las columnas inmovilizadas no se desplazan en horizontal. */}
          <div className="sheet-header-fixed" style={{ width: ROW_HEADER_WIDTH + frozenWidth }}>
            <div
              className="sheet-corner"
              title="Seleccionar toda la hoja"
              onPointerDown={(event) => {
                event.preventDefault()
                viewportRef.current?.focus()
                props.onSelect({ anchor: { row: 0, col: 0 }, focus: { row: MAX_ROWS - 1, col: MAX_COLUMNS - 1 } })
              }}
            />
            {indices(...fixedCols).map(columnHeader)}
          </div>
          {indices(...scrollCols).map(columnHeader)}
        </div>
        <div className="sheet-row-headers" style={{ height: totalHeight }}>
          {frozenRows > 0 && (
            <div className="sheet-row-headers-fixed" style={{ height: frozenHeight, marginBottom: -frozenHeight }}>
              {indices(...fixedRows).map(rowHeader)}
            </div>
          )}
          {indices(...scrollRows).map(rowHeader)}
        </div>
        <div
          className="sheet-cells"
          style={{ top: HEADER_HEIGHT, left: ROW_HEADER_WIDTH, width: totalWidth, height: totalHeight }}
          onPointerDown={onCellsPointerDown}
          onPointerMove={onCellsPointerMove}
          onPointerUp={() => (dragging.current = null)}
          onPointerCancel={() => (dragging.current = null)}
        >
          {renderRegion(mainRegion)}
          {selectionLayer(mainRegion)}
          {props.overlay}

          {frozenCols > 0 && (
            <div
              className="sheet-pane sheet-pane--left"
              style={{ width: frozenWidth, height: totalHeight, marginBottom: -totalHeight }}
            >
              {renderRegion(leftRegion)}
              {selectionLayer(leftRegion)}
            </div>
          )}
          {frozenRows > 0 && (
            <div className="sheet-pane sheet-pane--top" style={{ width: totalWidth, height: frozenHeight }}>
              {renderRegion(topRegion)}
              {selectionLayer(topRegion)}
              {frozenCols > 0 && (
                <div className="sheet-pane sheet-pane--corner" style={{ width: frozenWidth, height: frozenHeight }}>
                  {renderRegion(cornerRegion)}
                  {selectionLayer(cornerRegion)}
                </div>
              )}
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
  if (style?.fontFamily) css.fontFamily = cssFontFamilyFor(style.fontFamily)
  if (style?.fontSize) css.fontSize = `${style.fontSize}pt`
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

/** Tirador del borde de una cabecera: arrastrar cambia el ancho de la columna o el alto de la fila. */
function ResizeHandle({
  axis,
  size,
  min,
  onResize
}: {
  axis: 'column' | 'row'
  size: number
  min: number
  onResize(size: number): void
}) {
  const start = useRef<{ position: number; size: number } | null>(null)
  const position = (event: ReactPointerEvent) => (axis === 'column' ? event.clientX : event.clientY)
  return (
    <span
      className={axis === 'column' ? 'sheet-resize-handle' : 'sheet-row-resize-handle'}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.preventDefault()
        start.current = { position: position(event), size }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (start.current) onResize(Math.max(min, start.current.size + position(event) - start.current.position))
      }}
      onPointerUp={() => (start.current = null)}
    />
  )
}
