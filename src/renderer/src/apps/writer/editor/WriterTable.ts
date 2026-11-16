import { Extension, type Editor } from '@tiptap/core'
import { Table, TableCell, TableHeader, TableKit } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { paragraphsToTable } from '../model/tableFromText'
import {
  applyCellBorderAction,
  cellInlineStyle,
  DEFAULT_TABLE_STYLE,
  formatCellBorders,
  isTableStyleId,
  parseCellBorders,
  tableStyle,
  type CellBorderAction,
  type TableStyleId
} from '../model/tableStyles'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    writerTable: {
      /** Estilo de la tabla del cursor. */
      setTableStyle: (style: TableStyleId) => ReturnType
      /** Sombreado de las celdas seleccionadas (o la del cursor); null lo quita. */
      setCellShading: (color: string | null) => ReturnType
      /** Bordes de las celdas seleccionadas (o la del cursor). */
      applyCellBorders: (action: CellBorderAction) => ReturnType
      /** Los párrafos seleccionados pasan a ser una tabla (ver model/tableFromText). */
      convertTextToTable: () => ReturnType
    }
  }
}

/** Sombreado y bordes propios de una celda. Se pintan con estilo en línea; el estilo de la tabla, con CSS. */
const cellAttributes = () => ({
  background: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-background') || element.style.backgroundColor || null,
    // Pinta los dos atributos a la vez: así el `style` de uno no pisa el del otro.
    renderHTML: (attrs: Record<string, unknown>) => {
      const background = typeof attrs.background === 'string' ? attrs.background : null
      const borders = parseCellBorders(attrs.borders)
      const style = cellInlineStyle(borders, background)
      return {
        ...(background && { 'data-background': background }),
        ...(borders !== null && { 'data-borders': formatCellBorders(borders) }),
        ...(style && { style })
      }
    }
  },
  borders: {
    default: null,
    parseHTML: (element: HTMLElement) => formatCellBorders(parseCellBorders(element.getAttribute('data-borders'))),
    renderHTML: () => ({})
  }
})

const WriterTableNode = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tableStyle: {
        default: DEFAULT_TABLE_STYLE,
        parseHTML: (element) => {
          const style = element.getAttribute('data-table-style')
          return isTableStyleId(style) ? style : DEFAULT_TABLE_STYLE
        },
        renderHTML: (attrs) => ({ 'data-table-style': attrs.tableStyle })
      }
    }
  }
})

const WriterTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes() }
  }
})

const WriterTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes() }
  }
})

/** Celdas a las que se aplica un cambio: las seleccionadas o, sin selección de celdas, la del cursor. */
function targetCells(tr: Transaction): { pos: number; node: ProseMirrorNode }[] {
  const { selection } = tr
  if (selection instanceof CellSelection) {
    const cells: { pos: number; node: ProseMirrorNode }[] = []
    selection.forEachCell((node, pos) => cells.push({ node, pos }))
    return cells
  }
  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell')
      return [{ node, pos: $from.before(depth) }]
  }
  return []
}

/** La tabla que contiene una posición. */
function tableAt(doc: ProseMirrorNode, pos: number): { node: ProseMirrorNode; pos: number } | null {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (node.type.spec.tableRole === 'table') return { node, pos: $pos.before(depth) }
  }
  return null
}

const TableCommands = Extension.create({
  name: 'writerTable',

  addCommands() {
    return {
      setTableStyle:
        (style) =>
        ({ tr, dispatch }) => {
          const table = tableAt(tr.doc, tr.selection.from)
          if (!table) return false
          if (dispatch) tr.setNodeMarkup(table.pos, undefined, { ...table.node.attrs, tableStyle: style })
          return true
        },
      setCellShading:
        (color) =>
        ({ tr, dispatch }) => {
          const cells = targetCells(tr)
          if (cells.length === 0) return false
          if (dispatch)
            for (const cell of cells) tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, background: color })
          return true
        },
      applyCellBorders:
        (action) =>
        ({ tr, dispatch }) => {
          const cells = targetCells(tr)
          if (cells.length === 0) return false
          if (dispatch) {
            const style = tableStyle(tableAt(tr.doc, cells[0].pos + 1)?.node.attrs.tableStyle)
            for (const cell of cells) {
              const borders = applyCellBorderAction(style, parseCellBorders(cell.node.attrs.borders), action)
              tr.setNodeMarkup(cell.pos, undefined, { ...cell.node.attrs, borders: formatCellBorders(borders) })
            }
          }
          return true
        },
      convertTextToTable:
        () =>
        ({ state, tr, dispatch }) => {
          // Solo párrafos de primer nivel, enteros: desde el del principio de la selección al del final.
          // (Con Ctrl+A la selección está fuera de todo bloque, a profundidad 0: va de punta a punta.)
          const { $from, $to } = state.selection
          const from = $from.depth >= 1 ? $from.before(1) : $from.pos
          const to = $to.depth >= 1 ? $to.after(1) : $to.pos
          const paragraphs: ProseMirrorNode[] = []
          let onlyParagraphs = true
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (pos < from || node === state.doc) return true
            if (node.type.name === 'paragraph') paragraphs.push(node)
            else onlyParagraphs = false
            return false
          })
          if (!onlyParagraphs || paragraphs.length === 0) return false
          const json = paragraphsToTable(paragraphs.map((paragraph) => paragraph.toJSON()))
          if (!json) return false
          if (dispatch) {
            tr.replaceWith(from, to, state.schema.nodeFromJSON(json))
            tr.setSelection(TextSelection.near(tr.doc.resolve(from + 4)))
          }
          return true
        }
    }
  }
})

/**
 * Tablas de Texto: las de Tiptap con columnas redimensionables, más estilo de tabla y bordes y
 * sombreado por celda (fase 16).
 */
export const writerTableExtensions = () => [
  TableKit.configure({ table: false, tableCell: false, tableHeader: false }),
  WriterTableNode.configure({ resizable: true, cellMinWidth: 40 }),
  WriterTableCell,
  WriterTableHeader,
  TableCommands
]

/** Estilo de la tabla del cursor (para marcar el activo en la cinta). */
export function currentTableStyle(editor: Editor): TableStyleId | null {
  const table = tableAt(editor.state.doc, editor.state.selection.from)
  return table ? tableStyle(table.node.attrs.tableStyle).id : null
}
