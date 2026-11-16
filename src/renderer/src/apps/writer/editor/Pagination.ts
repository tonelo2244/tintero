import { Extension } from '@tiptap/core'
import { DOMSerializer, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { paginateSections, type MeasuredBlock, type PageBreak } from '../model/pageLayout'
import { DEFAULT_PAGE_SETUP, pageGeometry, type PageGeometry, type PageSetup } from '../model/pageSetup'
import { documentSections, SECTION_BREAK } from '../model/sections'

declare module '@tiptap/core' {
  interface Storage {
    pagination: PaginationStorage
  }
  interface Commands<ReturnType> {
    pagination: {
      /** Cambia la hoja del documento (la de la primera sección) y vuelve a repartir los bloques. */
      setPageSetup: (pageSetup: PageSetup) => ReturnType
      /** Enciende o apaga las hojas (las vistas Borrador, Esquema y Lectura van sin paginar). */
      setPaginationEnabled: (enabled: boolean) => ReturnType
    }
  }
}

/** Una hoja tal como se pinta detrás del texto, en píxeles desde la esquina de `.writer-page`. */
export interface SheetBox {
  top: number
  left: number
  /** Medidas y márgenes de su sección. */
  geometry: PageGeometry
}

export interface PaginationStorage {
  /** Hojas que ocupa el documento según la última medición. */
  pageCount: number
  /** Hoja del documento (la de la primera sección). */
  pageSetup: PageSetup
  /** Dónde va cada hoja; con secciones, cada una con su tamaño. */
  sheets: SheetBox[]
  /** Ancho de la hoja más ancha: el de `.writer-page`. Las demás se centran en él. */
  layoutWidth: number
  /** Sin paginar, el texto va seguido (vistas Borrador, Esquema y Lectura). */
  enabled: boolean
  /**
   * Posición en el documento donde empieza cada hoja (la 1 en 0): miniaturas, "ir a la página" y
   * la hoja del cursor. Puede caer dentro de un párrafo partido o de una tabla.
   */
  pageStarts: number[]
  /** Lo rellena la vista del plugin: pide un reparto nuevo en el siguiente fotograma. */
  requestLayout: (() => void) | null
}

const paginationKey = new PluginKey<DecorationSet>('pagination')

/** Contenedores que se pueden partir entre hojas por sus hijos: cada elemento de lista es un bloque. */
const SPLITTABLE = new Set(['bulletList', 'orderedList', 'taskList'])

/**
 * Paginación real en el editor. El documento sigue siendo uno (no hay una instancia de editor por
 * hoja, que rompería deshacer, buscar o seleccionar de una hoja a otra); lo que cambia es el sitio
 * que ocupa cada cosa, con decoraciones de ProseMirror que no tocan el documento guardado:
 *   - un bloque que baja entero lleva más margen superior;
 *   - un párrafo partido lleva un hueco (widget) delante del primer renglón que no cabe;
 *   - una tabla partida lleva una fila vacía de hueco y, si la tiene, una copia del encabezado.
 *
 * Cada vez que el texto cambia:
 *   1. se quitan los saltos y se miden los bloques (y sus renglones) tal como quedarían sin paginar;
 *   2. `paginate` (lógica pura, en model/pageLayout.ts) decide dónde empieza cada hoja;
 *   3. se aplican los saltos. Los pasos 1-3 van en el mismo fotograma: no se ve el parpadeo.
 * Al imprimir, cada hueco se cambia por un `break-before: page` (ver global.css): la hoja impresa
 * corta donde la de pantalla. En "Varias páginas", por un `break-before: column`.
 */
export const Pagination = Extension.create<object, PaginationStorage>({
  name: 'pagination',

  addStorage() {
    const geometry = pageGeometry(DEFAULT_PAGE_SETUP)
    return {
      pageCount: 1,
      pageSetup: DEFAULT_PAGE_SETUP,
      sheets: [{ top: 0, left: 0, geometry }],
      layoutWidth: geometry.width,
      enabled: true,
      pageStarts: [0],
      requestLayout: null
    }
  },

  addCommands() {
    return {
      setPageSetup: (pageSetup) => () => {
        this.storage.pageSetup = pageSetup
        this.storage.requestLayout?.()
        return true
      },
      setPaginationEnabled: (enabled) => () => {
        if (this.storage.enabled === enabled) return true
        this.storage.enabled = enabled
        this.storage.requestLayout?.()
        return true
      }
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, decorations) => tr.getMeta(paginationKey) ?? decorations.map(tr.mapping, tr.doc)
        },
        props: {
          decorations: (state) => paginationKey.getState(state)
        },
        view: (view) => {
          let frame = 0
          let lastWidth = 0
          const schedule = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
              // Durante una composición (acentos, IME) no se puede despachar sin estropearla.
              if (view.composing) return schedule()
              layout(view, storage)
            })
          }
          // Solo los cambios de ancho cambian el reparto (el alto lo cambiamos nosotros).
          const resize = new ResizeObserver(([entry]) => {
            const width = entry.contentRect.width
            if (Math.abs(width - lastWidth) < 0.5) return
            lastWidth = width
            schedule()
          })
          resize.observe(view.dom)
          // Imágenes que terminan de cargar y fuentes que llegan tarde cambian el alto de los bloques.
          view.dom.addEventListener('load', schedule, true)
          storage.requestLayout = schedule
          void document.fonts?.ready.then(schedule)
          schedule()
          return {
            update: (current, previous) => {
              if (!current.state.doc.eq(previous.doc)) schedule()
            },
            destroy: () => {
              cancelAnimationFrame(frame)
              storage.requestLayout = null
              resize.disconnect()
              view.dom.removeEventListener('load', schedule, true)
            }
          }
        }
      })
    ]
  }
})

/** Una tabla cuyas filas se reparten entre hojas. */
interface TableInfo {
  pos: number
  /** Fila de encabezado que se repite arriba de cada hoja (la primera, si son todo celdas de encabezado). */
  header: ProseMirrorNode | null
  columns: number
}

interface Unit {
  pos: number
  node: ProseMirrorNode
  /** Va justo detrás de un salto de página. */
  breakBefore: boolean
  /** Las filas de tabla se mueven con huecos dentro de la tabla, no con margen. */
  table?: TableInfo
  /** Primera fila: si baja, baja la tabla entera (con margen, como un bloque). */
  firstRow?: boolean
  section: number
}

/** Un renglón medido, con el bloque de texto al que pertenece (para saber dónde partir). */
interface Line {
  top: number
  bottom: number
  /** En coordenadas de pantalla: las que entiende coordsAtPos. */
  screenTop: number
  textblockPos: number
  textblock: ProseMirrorNode
  /** Es el primer renglón de su bloque de texto: se parte justo al principio. */
  first: boolean
}

type MeasuredUnit = Unit & MeasuredBlock & { textLines?: Line[] }

/**
 * Bloques que pueden abrir una hoja, en orden: los de primer nivel, los elementos de las listas y
 * las filas de las tablas. Los saltos de página no son unidades (no ocupan sitio): marcan la siguiente.
 */
function collectUnits(doc: ProseMirrorNode, sectionOf: number[]): Unit[] {
  const units: Unit[] = []
  let breakBefore = false
  let section = 0
  const push = (unit: Omit<Unit, 'breakBefore' | 'section'>) => {
    units.push({ ...unit, breakBefore, section })
    breakBefore = false
  }
  doc.forEach((node, offset, index) => {
    section = sectionOf[index] ?? section
    if (node.type.name === 'pageBreak' || node.type.name === SECTION_BREAK) {
      // El salto de sección también abre hoja, pero eso ya lo sabe paginate por el cambio de sección.
      if (node.type.name === 'pageBreak') breakBefore = true
    } else if (SPLITTABLE.has(node.type.name)) {
      node.forEach((item, itemOffset) => push({ pos: offset + 1 + itemOffset, node: item }))
    } else if (node.type.name === 'table') {
      const table: TableInfo = { pos: offset, header: headerRow(node), columns: columnCount(node) }
      node.forEach((row, rowOffset) =>
        push({ pos: offset + 1 + rowOffset, node: row, table, firstRow: rowOffset === 0 })
      )
    } else {
      push({ pos: offset, node })
    }
  })
  return units
}

/** Hoja de cada sección y sección de cada bloque de primer nivel. */
interface SectionLayout {
  geometries: PageGeometry[]
  sectionOf: number[]
}

function sectionLayout(doc: ProseMirrorNode, pageSetup: PageSetup): SectionLayout {
  const blocks: { type: string; attrs: Record<string, unknown> }[] = []
  doc.forEach((node) => blocks.push({ type: node.type.name, attrs: node.attrs }))
  const { setups, sectionOf } = documentSections(blocks, pageSetup)
  return { geometries: setups.map(pageGeometry), sectionOf }
}

/**
 * Bloques de una sección cuya hoja es más ancha o más estrecha que la primera: se desplazan y se
 * ensanchan para caer dentro de su hoja (las hojas se centran unas sobre otras, como en Word).
 * Todos los bloques de una sección distinta de la primera llevan además `writer-section-N`: al
 * imprimir, esa clase les da su hoja (`@page` con nombre, ver printPageCss).
 */
function sectionDecorations(view: EditorView, sections: SectionLayout): Decoration[] {
  const base = sections.geometries[0]
  const decorations: Decoration[] = []
  view.state.doc.forEach((node, offset, index) => {
    const section = sections.sectionOf[index] ?? 0
    if (section === 0 || node.type.name === 'pageBreak' || node.type.name === SECTION_BREAK) return
    const geometry = sections.geometries[section]
    const dx = (base.width - geometry.width) / 2 + geometry.margins.left - base.margins.left
    const attrs: { class: string; style?: string } = { class: `writer-section-${section}` }
    if (Math.abs(dx) > 0.5 || Math.abs(geometry.contentWidth - base.contentWidth) > 0.5) {
      // El ancho es el del área de texto menos los márgenes propios del bloque (sus sangrías).
      const dom = view.nodeDOM(offset)
      const style = dom instanceof HTMLElement ? getComputedStyle(dom) : null
      const ownMargins = style ? (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0) : 0
      attrs.class += ' writer-section-block'
      attrs.style = `left: ${dx.toFixed(2)}px; width: ${(geometry.contentWidth - ownMargins).toFixed(2)}px`
    }
    decorations.push(Decoration.node(offset, offset + node.nodeSize, attrs))
  })
  return decorations
}

function headerRow(table: ProseMirrorNode): ProseMirrorNode | null {
  const first = table.firstChild
  if (!first || table.childCount < 2) return null
  let allHeaders = first.childCount > 0
  first.forEach((cell) => {
    if (cell.type.name !== 'tableHeader') allHeaders = false
  })
  return allHeaders ? first : null
}

function columnCount(table: ProseMirrorNode): number {
  let columns = 0
  table.firstChild?.forEach((cell) => {
    columns += (cell.attrs.colspan as number | undefined) ?? 1
  })
  return Math.max(1, columns)
}

/** Mide, reparte y aplica los saltos, y anota el número de hojas. */
function layout(view: EditorView, storage: PaginationStorage): void {
  const hadDecorations = paginationKey.getState(view.state) !== DecorationSet.empty
  const replaceDecorations = (decorations: Decoration[]) =>
    view.dispatch(
      view.state.tr
        .setMeta(paginationKey, DecorationSet.create(view.state.doc, decorations))
        .setMeta('addToHistory', false)
    )
  // En "Varias páginas" las hojas son columnas: se mide con el texto en una sola tira (ver global.css).
  const host = view.dom.closest<HTMLElement>('.writer-page')
  host?.setAttribute('data-measuring', '')
  try {
    const sections = sectionLayout(view.state.doc, storage.pageSetup)
    const base = sections.geometries[0]
    if (!storage.enabled) {
      // Sin hojas: se quitan los saltos y el documento cuenta como una sola tira de texto.
      if (hadDecorations) replaceDecorations([])
      const changed = storage.pageCount !== 1
      storage.pageCount = 1
      storage.pageStarts = [0]
      storage.sheets = [{ top: 0, left: 0, geometry: base }]
      storage.layoutWidth = base.width
      if (changed) view.dispatch(view.state.tr.setMeta('addToHistory', false))
      return
    }

    // 1. Sin saltos, pero cada sección ya con su ancho (el ancho cambia el alto de los párrafos).
    const sectionDecos = sectionDecorations(view, sections)
    if (hadDecorations || sectionDecos.length > 0) replaceDecorations(sectionDecos)
    // 2. Medir y repartir.
    const measured = measureUnits(view, sections)
    const formats = sections.geometries.map((geometry) => ({
      contentHeight: geometry.contentHeight,
      marginTop: geometry.margins.top,
      marginBottom: geometry.margins.bottom
    }))
    const { breaks, pages } = paginateSections(measured, formats, base.gap)
    // 3. Aplicar los saltos.
    const decorations: Decoration[] = [...sectionDecos]
    const pageStarts: number[] = [0]
    for (const pageBreak of breaks) {
      const placed = breakDecorations(view, measured, pageBreak)
      decorations.push(...placed.decorations)
      pageStarts[pageBreak.page] = placed.pageStart
    }
    // Una hoja que solo continúa un bloque enorme empieza donde la anterior.
    for (let page = 1; page < pages.length; page++) pageStarts[page] ??= pageStarts[page - 1]
    storage.pageStarts = pageStarts
    const layoutWidth = Math.max(...sections.geometries.map((geometry) => geometry.width))
    storage.layoutWidth = layoutWidth
    const previousSheets = JSON.stringify(storage.sheets)
    storage.sheets = pages.map((page) => {
      const geometry = sections.geometries[page.section] ?? base
      return {
        top: base.margins.top + page.top - geometry.margins.top,
        left: (layoutWidth - geometry.width) / 2,
        geometry
      }
    })
    // Sin decoraciones antes ni ahora y con las mismas hojas no hay nada que avisar: nos ahorramos la transacción.
    const sheetsChanged = JSON.stringify(storage.sheets) !== previousSheets
    if (!hadDecorations && decorations.length === 0 && storage.pageCount === pages.length && !sheetsChanged) return
    // Antes de despachar: quien lea las hojas al recibir la transacción (la barra de estado) ve el valor nuevo.
    storage.pageCount = pages.length
    replaceDecorations(decorations)
  } finally {
    host?.removeAttribute('data-measuring')
  }
}

/** Cajas de cada unidad (y sus renglones, si es texto que se puede partir) relativas al principio del texto. */
function measureUnits(view: EditorView, sections: SectionLayout): MeasuredUnit[] {
  const origin = view.dom.getBoundingClientRect()
  // Con zoom, getBoundingClientRect da píxeles de pantalla; offsetHeight, píxeles del documento.
  const scale = view.dom.offsetHeight > 0 ? origin.height / view.dom.offsetHeight : 1
  const toY = (screenY: number) => (screenY - origin.top) / scale
  const measured: MeasuredUnit[] = []
  for (const unit of collectUnits(view.state.doc, sections.sectionOf)) {
    const dom = view.nodeDOM(unit.pos)
    if (!(dom instanceof HTMLElement)) continue
    // La primera fila de una tabla mueve la tabla entera: cuenta desde el borde de la tabla.
    const tableDom = unit.firstRow && unit.table ? view.nodeDOM(unit.table.pos) : null
    const top = (tableDom instanceof HTMLElement ? tableDom : dom).getBoundingClientRect().top
    const block: MeasuredUnit = { ...unit, top: toY(top), bottom: toY(dom.getBoundingClientRect().bottom) }
    if (unit.node.type.name.startsWith('heading')) block.keepWithNext = true
    if (unit.table) {
      const isHeader = unit.table.header !== null && unit.firstRow
      if (isHeader) block.keepWithNext = true
      else if (unit.table.header && !unit.firstRow) {
        const headerDom = view.nodeDOM(unit.table.pos + 1)
        if (headerDom instanceof HTMLElement) block.repeatHeight = headerDom.getBoundingClientRect().height / scale
      }
    } else {
      const textLines = measureLines(view, unit, toY)
      if (textLines.length > 0) {
        block.textLines = textLines
        block.lines = textLines
      }
    }
    measured.push(block)
  }
  return measured
}

/**
 * Renglones de los bloques de texto de una unidad, con `Range.getClientRects()`: un rectángulo
 * por trozo de texto y renglón. Los que se solapan en vertical son el mismo renglón.
 */
function measureLines(view: EditorView, unit: Unit, toY: (screenY: number) => number): Line[] {
  if (unit.node.isAtom) return []
  const lines: Line[] = []
  const visit = (textblock: ProseMirrorNode, textblockPos: number) => {
    const dom = view.nodeDOM(textblockPos)
    if (!(dom instanceof HTMLElement) || textblock.content.size === 0) return
    const range = document.createRange()
    range.selectNodeContents(dom)
    const rects = [...range.getClientRects()].filter((rect) => rect.height > 0).sort((a, b) => a.top - b.top)
    let current: Line | null = null
    for (const rect of rects) {
      if (current && rect.top < current.screenTop + (current.bottom - current.top) * 0.5) {
        current.bottom = Math.max(current.bottom, toY(rect.bottom))
        continue
      }
      current = {
        top: toY(rect.top),
        bottom: toY(rect.bottom),
        screenTop: rect.top,
        textblockPos,
        textblock,
        first: current === null
      }
      lines.push(current)
    }
  }
  if (unit.node.isTextblock) visit(unit.node, unit.pos)
  else
    unit.node.descendants((child, childPos) => {
      if (child.type.name === 'table') return false
      if (child.isTextblock) {
        visit(child, unit.pos + 1 + childPos)
        return false
      }
      return true
    })
  return lines
}

/** Decoraciones de un salto y la posición del documento donde empieza la hoja nueva. */
function breakDecorations(
  view: EditorView,
  measured: MeasuredUnit[],
  { index, shift, line }: PageBreak
): { decorations: Decoration[]; pageStart: number } {
  const unit = measured[index]
  if (line !== undefined && unit.textLines) {
    // Párrafo partido: un hueco del alto del salto justo antes del primer renglón que no cabe.
    const pos = lineStart(view, unit.textLines[line])
    const widget = Decoration.widget(pos, () => splitWidget(shift), {
      side: -1,
      ignoreSelection: true,
      key: `split-${shift.toFixed(1)}`
    })
    return { decorations: [widget], pageStart: pos }
  }
  if (unit.table && !unit.firstRow) {
    // Fila de tabla: una fila vacía hace de hueco entre hojas y, si la hay, se repite el encabezado.
    const { table } = unit
    const decorations = [
      Decoration.widget(unit.pos, () => tableGapRow(shift, table.columns), {
        side: -2,
        key: `gap-${shift.toFixed(1)}-${table.columns}`
      })
    ]
    if (table.header) {
      const header = table.header
      decorations.push(Decoration.widget(unit.pos, () => repeatedHeader(view, header), { side: -1 }))
    } else {
      decorations.push(Decoration.node(unit.pos, unit.pos + unit.node.nodeSize, { class: 'writer-row-break' }))
    }
    return { decorations, pageStart: unit.pos }
  }
  // Bloque entero (o tabla desde su primera fila): el margen nuevo sustituye al hueco que tenía
  // con el anterior (márgenes colapsados).
  const pos = unit.table ? unit.table.pos : unit.pos
  const node = view.state.doc.nodeAt(pos) ?? unit.node
  const gap = unit.top - (index > 0 ? measured[index - 1].bottom : 0)
  const decoration = Decoration.node(pos, pos + node.nodeSize, {
    class: 'writer-page-start',
    style: `margin-top: ${(gap + shift).toFixed(2)}px`
  })
  return { decorations: [decoration], pageStart: pos }
}

/**
 * Posición del primer carácter de un renglón: la primera cuyo borde superior está ya en él.
 * Las coordenadas crecen con la posición, así que basta una búsqueda binaria.
 */
function lineStart(view: EditorView, line: Line): number {
  const start = line.textblockPos + 1
  if (line.first) return start
  let low = start
  let high = start + line.textblock.content.size
  while (low < high) {
    const middle = (low + high) >> 1
    let top: number
    try {
      top = view.coordsAtPos(middle, 1).top
    } catch {
      top = Number.NEGATIVE_INFINITY
    }
    if (top >= line.screenTop - 1) high = middle
    else low = middle + 1
  }
  return low
}

/** Hueco dentro de un párrafo: ocupa un renglón entero del alto que haga falta (ver global.css). */
function splitWidget(height: number): HTMLElement {
  const spacer = document.createElement('span')
  spacer.className = 'writer-page-split'
  spacer.contentEditable = 'false'
  spacer.setAttribute('aria-hidden', 'true')
  spacer.style.height = `${height.toFixed(2)}px`
  return spacer
}

function tableGapRow(height: number, columns: number): HTMLElement {
  const row = document.createElement('tr')
  row.className = 'writer-table-gap'
  row.contentEditable = 'false'
  row.setAttribute('aria-hidden', 'true')
  const cell = document.createElement('td')
  cell.colSpan = columns
  cell.style.height = `${height.toFixed(2)}px`
  row.appendChild(cell)
  return row
}

/** Copia de solo lectura de la fila de encabezado, arriba de la tabla en cada hoja nueva. */
function repeatedHeader(view: EditorView, header: ProseMirrorNode): HTMLElement {
  const row = DOMSerializer.fromSchema(view.state.schema).serializeNode(header) as HTMLElement
  row.classList.add('writer-table-repeat')
  row.contentEditable = 'false'
  row.setAttribute('aria-hidden', 'true')
  return row
}
