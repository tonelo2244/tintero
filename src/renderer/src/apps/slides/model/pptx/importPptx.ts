import JSZip from 'jszip'
import type { ImportResult } from '@/core/appModule'
import { createId } from '@/core/ids'
import { bytesToDataUrl, detectImageKind, mimeForKind } from '@/core/office/images'
import {
  attr,
  child,
  childElements,
  descendants,
  numberAttr,
  parseXml,
  path,
  relationAttr,
  readRelationships,
  relsPathFor,
  type Relationship
} from '@/core/office/xml'
import { cssFontFamilyFor } from '@/ui/fonts'
import { createShapeElement, createTextElement } from '../factories'
import { normalizeRotation } from '../presentationReducer'
import { normalizeParagraphs } from '../richText'
import { IMPORTED_THEME_ID, type SlideTheme } from '../themes'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Box,
  type HorizontalAlign,
  type ImageElement,
  type ShapeKind,
  type Slide,
  type SlideElement,
  type Presentation,
  type RunFormat,
  type TableCell,
  type TableElement,
  type TextParagraph,
  type TextRole,
  type TextStyle,
  type VerticalAlign
} from '../types'
import { backgroundCss, createColorResolver, readColorMap, readThemeInfo, type ColorResolver } from './pptxTheme'

/**
 * Importación de .pptx leyendo directamente su XML.
 *
 * Un .pptx es un zip con un XML por diapositiva. Cada forma (p:sp) tiene posición (a:off/a:ext),
 * geometría (a:prstGeom) y texto (a:p/a:r/a:t). Lo que no está en la diapositiva se hereda en
 * cadena: diapositiva -> diseño (slideLayout) -> patrón (slideMaster). Aquí seguimos esa cadena
 * para lo que más se nota (posición, tamaño de letra, alineación y viñetas) y contamos todo lo
 * que no podemos representar para avisar al usuario.
 */

const EMU_PER_PX = 9525 // 914400 EMU por pulgada / 96 px por pulgada

const REL_TYPE = {
  slide: '/slide',
  layout: '/slideLayout',
  master: '/slideMaster',
  theme: '/theme',
  notes: '/notesSlide',
  image: '/image'
} as const

const TABLE_URI = 'http://schemas.openxmlformats.org/drawingml/2006/table'

const SHAPES_BY_PRESET: Record<string, ShapeKind> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  rightArrow: 'arrow',
  star5: 'star'
}

const ALIGN: Record<string, HorizontalAlign> = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }
const ANCHOR: Record<string, VerticalAlign> = { t: 'top', ctr: 'middle', b: 'bottom' }

/** Lo que no se puede representar en Tintero; se cuenta para el aviso final. */
interface Losses {
  background: boolean
  flipped: number
  unsupportedShapes: number
  charts: number
  mergedTableCells: number
  unsupportedImages: number
  aspectRatio: string | null
}

/** Cambio de coordenadas de los grupos: punto hijo (EMU) -> punto de la diapositiva (EMU). */
interface Transform {
  offsetX: number
  offsetY: number
  scaleX: number
  scaleY: number
}

const IDENTITY: Transform = { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }

export async function importPptx(bytes: Uint8Array): Promise<ImportResult<Presentation>> {
  const reader = new PptxReader(await JSZip.loadAsync(bytes))
  return reader.read()
}

class PptxReader {
  private readonly xmlCache = new Map<string, Promise<Element | null>>()
  private readonly losses: Losses = {
    background: false,
    flipped: 0,
    unsupportedShapes: 0,
    charts: 0,
    mergedTableCells: 0,
    unsupportedImages: 0,
    aspectRatio: null
  }
  /** EMU de PowerPoint -> unidades de Tintero (1280x720), centrando si el formato no es 16:9. */
  private scale = 1 / EMU_PER_PX
  private offsetX = 0
  private offsetY = 0
  /** Colores del tema de PowerPoint. Sin tema (archivo mínimo), solo se entienden los RGB fijos. */
  private resolveColor: ColorResolver = createColorResolver(readThemeInfo(null), readColorMap(null))
  private importedTheme: SlideTheme | null = null
  private firstMasterPath: string | null = null

  constructor(private readonly zip: JSZip) {}

  async read(): Promise<ImportResult<Presentation>> {
    const presentationPath = 'ppt/presentation.xml'
    const presentation = await this.xml(presentationPath)
    if (!presentation) throw new Error('El archivo no es una presentación de PowerPoint válida.')

    this.setSlideSize(child(presentation, 'sldSz'))
    const rels = await this.relationships(presentationPath)
    const slidePaths = childElements(child(presentation, 'sldIdLst'), 'sldId')
      .map((slideId) => rels.get(relationAttr(slideId, 'id') ?? '')?.target)
      .filter((target): target is string => Boolean(target))

    this.firstMasterPath = findRelation(rels, REL_TYPE.master)
    if (this.firstMasterPath) await this.readTheme(this.firstMasterPath)

    const slides: Slide[] = []
    for (const slidePath of slidePaths) slides.push(await this.readSlide(slidePath))
    if (slides.length === 0) throw new Error('La presentación no tiene diapositivas.')

    const content: Presentation = this.importedTheme
      ? {
          themeId: this.importedTheme.id,
          slides: liftSharedBackground(slides, this.importedTheme),
          importedTheme: this.importedTheme
        }
      : { themeId: 'blank', slides }
    return { content, warnings: describeLosses(this.losses) }
  }

  /**
   * Tema "importado" a partir del patrón y su tema: colores, fuentes y fondo. Así la presentación
   * se ve como en PowerPoint y se puede cambiar a un tema de Tintero con un clic.
   */
  private async readTheme(masterPath: string): Promise<void> {
    const master = await this.xml(masterPath)
    const themePath = findRelation(await this.relationships(masterPath), REL_TYPE.theme)
    const theme = themePath ? await this.xml(themePath) : null
    if (!master || !theme) return
    const info = readThemeInfo(theme)
    const colorMap = readColorMap(master)
    this.resolveColor = createColorResolver(info, colorMap)

    const schemeColor = (name: string) => info.scheme[colorMap[name] ?? name]
    const levelOneColor = (style: string) =>
      this.resolveColor(path(master, 'txStyles', style, 'lvl1pPr', 'defRPr', 'solidFill'))
    const hex = (value: string | null | undefined, fallback: string) => `#${(value ?? fallback).toLowerCase()}`
    const background = (await this.background(master, masterPath)) ?? hex(schemeColor('bg1'), 'FFFFFF')
    const font = (typeface: string | null) => cssFontFamilyFor(typeface ?? 'Calibri')

    this.importedTheme = {
      id: IMPORTED_THEME_ID,
      name: info.name ? `Importado (${info.name})` : 'Importado',
      background,
      titleColor: hex(levelOneColor('titleStyle') ?? schemeColor('tx1'), '111111'),
      textColor: hex(levelOneColor('bodyStyle') ?? schemeColor('tx1'), '222222'),
      accentColor: hex(info.scheme.accent1, 'C2410C'),
      fontFamily: font(info.minorFont),
      titleFontFamily: font(info.majorFont ?? info.minorFont)
    }
  }

  /** Fondo de una parte (diapositiva, diseño o patrón) como CSS, cargando la imagen si la hay. */
  private async background(root: Element | null, partPath: string): Promise<string | null> {
    if (!path(root, 'cSld', 'bg')) return null
    const embedId = relationAttr(path(root, 'cSld', 'bg', 'bgPr', 'blipFill', 'blip'), 'embed')
    let imageUrl: string | null = null
    if (embedId) {
      const target = (await this.relationships(partPath)).get(embedId)?.target
      const file = target ? this.zip.file(target) : null
      const bytes = file ? await file.async('uint8array') : null
      const kind = bytes ? detectImageKind(bytes) : null
      if (bytes && kind) imageUrl = bytesToDataUrl(bytes, mimeForKind(kind))
    }
    const css = backgroundCss(root, this.resolveColor, () => imageUrl)
    if (css === null) this.losses.background = true
    return css
  }

  private setSlideSize(size: Element | null): void {
    const widthPx = (numberAttr(size, 'cx') ?? SLIDE_WIDTH * EMU_PER_PX) / EMU_PER_PX
    const heightPx = (numberAttr(size, 'cy') ?? SLIDE_HEIGHT * EMU_PER_PX) / EMU_PER_PX
    const fit = Math.min(SLIDE_WIDTH / widthPx, SLIDE_HEIGHT / heightPx)
    this.scale = fit / EMU_PER_PX
    this.offsetX = (SLIDE_WIDTH - widthPx * fit) / 2
    this.offsetY = (SLIDE_HEIGHT - heightPx * fit) / 2
    const ratio = widthPx / heightPx
    if (Math.abs(ratio - 16 / 9) > 0.02) this.losses.aspectRatio = Math.abs(ratio - 4 / 3) < 0.02 ? '4:3' : 'distinto'
  }

  private async readSlide(slidePath: string): Promise<Slide> {
    const slide = await this.xml(slidePath)
    const rels = await this.relationships(slidePath)
    const layoutPath = findRelation(rels, REL_TYPE.layout)
    const layout = layoutPath ? await this.xml(layoutPath) : null
    const masterPath = layoutPath ? findRelation(await this.relationships(layoutPath), REL_TYPE.master) : null
    const master = masterPath ? await this.xml(masterPath) : null

    // Fondo propio: el de la diapositiva o el de su diseño. El del primer patrón ya es el del tema.
    const background =
      (await this.background(slide, slidePath)) ??
      (layoutPath ? await this.background(layout, layoutPath) : null) ??
      (masterPath && masterPath !== this.firstMasterPath ? await this.background(master, masterPath) : null)

    const context: SlideContext = { slidePath, rels, layout, master }
    const elements = await this.readShapeTree(path(slide, 'cSld', 'spTree'), context, IDENTITY)

    const notesPath = findRelation(rels, REL_TYPE.notes)
    const notes = notesPath ? notesText(await this.xml(notesPath)) : ''
    const result: Slide = { id: createId('slide'), layout: 'blank', elements, notes }
    if (background) result.background = background
    return result
  }

  private async readShapeTree(tree: Element | null, context: SlideContext, transform: Transform) {
    const elements: SlideElement[] = []
    for (const node of childElements(tree)) {
      switch (node.localName) {
        case 'sp':
          elements.push(...this.readShape(node, context, transform))
          break
        case 'pic': {
          const image = await this.readPicture(node, context, transform)
          if (image) elements.push(image)
          break
        }
        case 'grpSp':
          elements.push(...(await this.readShapeTree(node, context, groupTransform(node, transform))))
          break
        case 'graphicFrame': {
          // Marco de "contenido gráfico": tablas (las leemos), gráficos y SmartArt (no).
          const table = this.readTable(node, transform)
          if (table) elements.push(table)
          else this.losses.charts++
          break
        }
        case 'cxnSp': // conectores (líneas entre formas)
          this.losses.unsupportedShapes++
          break
      }
    }
    return elements
  }

  private readShape(shape: Element, context: SlideContext, transform: Transform): SlideElement[] {
    const placeholder = path(shape, 'nvSpPr', 'nvPr', 'ph')
    const inherited = placeholder ? findInheritedPlaceholders(placeholder, context) : []
    const xfrm = path(shape, 'spPr', 'xfrm') ?? inherited.map((source) => path(source, 'spPr', 'xfrm')).find(Boolean)
    if (!xfrm) return []
    const box = this.box(xfrm, transform)

    const elements: SlideElement[] = []
    const shapeElement = this.readGeometry(shape, box)
    if (shapeElement) elements.push(shapeElement)

    const text = this.readText(shape, placeholder, inherited, context, box, shapeElement !== null)
    if (text) elements.push(text)
    // La forma y su texto giran juntos, como en PowerPoint.
    const rotation = this.rotation(xfrm)
    return rotation ? elements.map((element) => ({ ...element, rotation })) : elements
  }

  /** Forma visible (con relleno o borde). Un cuadro de texto transparente no genera forma. */
  private readGeometry(shape: Element, box: Box): SlideElement | null {
    const spPr = child(shape, 'spPr')
    const preset = attr(child(spPr, 'prstGeom'), 'prst')
    const solidFill = this.resolveColor(child(spPr, 'solidFill'))
    const fillRef = path(shape, 'style', 'fillRef')
    const themeFill = Number(attr(fillRef, 'idx') ?? 0) > 0
    const hasFill = !child(spPr, 'noFill') && (solidFill !== null || themeFill || Boolean(child(spPr, 'gradFill')))
    const line = child(spPr, 'ln')
    const lineColor = child(line, 'noFill') ? null : this.resolveColor(child(line, 'solidFill'))
    if (!hasFill && !lineColor) return null

    let kind = preset ? SHAPES_BY_PRESET[preset] : undefined
    if (!kind) {
      this.losses.unsupportedShapes++
      kind = 'rect'
    }
    const element = createShapeElement(kind, box)
    // El relleno del estilo de la forma (fillRef) suele ser accent1: si coincide con el acento del tema,
    // se deja sin color propio para que siga al tema si el usuario lo cambia.
    const styleFill = themeFill && !solidFill ? this.resolveColor(fillRef) : null
    const ownFill =
      solidFill ?? (styleFill && `#${styleFill.toLowerCase()}` !== this.importedTheme?.accentColor ? styleFill : null)
    element.style = {
      fill: hasFill && ownFill ? `#${ownFill}` : null,
      stroke: lineColor && `#${lineColor}`,
      strokeWidth: lineColor ? Math.max(1, Math.round((numberAttr(line, 'w') ?? 12700) / EMU_PER_PX)) : 0
    }
    return element
  }

  private readText(
    shape: Element,
    placeholder: Element | null,
    inherited: Element[],
    context: SlideContext,
    box: Box,
    /** El texto va dentro de una forma con relleno (no sobre el fondo de la diapositiva). */
    insideShape: boolean
  ): SlideElement | null {
    const body = child(shape, 'txBody')
    const paragraphs = childElements(body, 'p')
    if (!paragraphs.map(paragraphText).join('').trim()) return null

    const role = roleOf(placeholder)
    const levelOneSources = styleSources(shape, inherited, context.master, role)
    const firstParagraph = paragraphs.find((paragraph) => paragraphText(paragraph).trim()) ?? paragraphs[0]
    // Propiedades de cada trozo de texto (a:r > a:rPr); un trozo sin a:rPr usa las heredadas.
    const runs = descendants(body, 'r').filter((run) => child(run, 't')?.textContent)
    const firstRun = runs.map((run) => child(run, 'rPr'))[0] ?? null
    const runProp = (name: string) =>
      attr(firstRun, name) ?? levelOneSources.map((source) => attr(child(source, 'defRPr'), name)).find(isSet) ?? null

    const sizeInHundredths = Number(runProp('sz') ?? 1800)
    const color =
      this.resolveColor(child(firstRun, 'solidFill')) ??
      (insideShape ? this.resolveColor(path(shape, 'style', 'fontRef')) : null)
    const align = attr(child(firstParagraph, 'pPr'), 'algn') ?? levelOneSources.map((s) => attr(s, 'algn')).find(isSet)
    const anchor = [child(shape, 'txBody'), ...inherited.map((source) => child(source, 'txBody'))]
      .map((txBody) => attr(child(txBody, 'bodyPr'), 'anchor'))
      .find(isSet)

    const style: Partial<TextStyle> = {
      fontFamily: fontOf(firstRun),
      // Tamaño en centésimas de punto -> px de Tintero, con la misma escala que las posiciones.
      fontSize: this.fontSizePx(sizeInHundredths),
      bold: runProp('b') === '1',
      italic: runProp('i') === '1',
      underline: Boolean(runProp('u')) && runProp('u') !== 'none',
      strike: Boolean(runProp('strike')) && runProp('strike') !== 'noStrike',
      color: color && this.isVisible(color, insideShape) ? `#${color}` : null,
      align: ALIGN[align ?? ''] ?? 'left',
      // Por defecto PowerPoint centra en vertical el texto de títulos y formas.
      verticalAlign: ANCHOR[anchor ?? ''] ?? (role === 'title' || insideShape ? 'middle' : 'top'),
      bullets: hasBullets(firstParagraph, levelOneSources)
    }
    const element = createTextElement(role, box, { style })
    // El formato del primer trozo es el del cuadro; cada trozo guarda solo lo que cambia respecto a él.
    element.paragraphs = normalizeParagraphs(
      paragraphs.flatMap((paragraph) => this.readParagraph(paragraph, element.style, insideShape))
    )
    return element
  }

  /** Tamaño en centésimas de punto -> px de Tintero, con la misma escala que las posiciones. */
  private fontSizePx(hundredthsOfPoint: number): number {
    return Math.max(6, Math.round((hundredthsOfPoint / 100 / 0.75) * this.scale * EMU_PER_PX))
  }

  /** Un a:p con sus trozos (a:r). Un salto de línea (a:br) abre un párrafo nuevo, como en el editor. */
  private readParagraph(paragraph: Element, style: TextStyle, insideShape: boolean): TextParagraph[] {
    const result: TextParagraph[] = [{ runs: [] }]
    for (const node of childElements(paragraph)) {
      if (node.localName === 'br') {
        result.push({ runs: [] })
      } else if (node.localName === 'r' || node.localName === 'fld') {
        const text = child(node, 't')?.textContent ?? ''
        if (text) result.at(-1)!.runs.push({ text, ...this.readRunFormat(child(node, 'rPr'), style, insideShape) })
      }
    }
    return result
  }

  /** Formato propio de un trozo: solo lo que el a:rPr dice explícitamente y es distinto del cuadro. */
  private readRunFormat(rPr: Element | null, style: TextStyle, insideShape: boolean): RunFormat {
    const format: RunFormat = {}
    const toggle = (name: string, offValue: string) => {
      const value = attr(rPr, name)
      return value === null ? undefined : value !== '0' && value !== 'false' && value !== offValue
    }
    const flags = {
      bold: toggle('b', '0'),
      italic: toggle('i', '0'),
      underline: toggle('u', 'none'),
      strike: toggle('strike', 'noStrike')
    }
    for (const [key, value] of Object.entries(flags) as [keyof typeof flags, boolean | undefined][]) {
      if (value !== undefined && value !== style[key]) format[key] = value
    }
    const size = numberAttr(rPr, 'sz')
    if (size) {
      const px = this.fontSizePx(size)
      if (px !== style.fontSize) format.fontSize = px
    }
    const font = fontOf(rPr)
    if (font && font !== style.fontFamily) format.fontFamily = font
    const color = this.resolveColor(child(rPr, 'solidFill'))
    if (color && this.isVisible(color, insideShape) && `#${color}` !== style.color) format.color = `#${color}`
    return format
  }

  private async readPicture(picture: Element, context: SlideContext, transform: Transform) {
    const xfrm = path(picture, 'spPr', 'xfrm')
    const embedId = relationAttr(descendants(picture, 'blip')[0], 'embed')
    const target = embedId ? context.rels.get(embedId)?.target : null
    const file = target ? this.zip.file(target) : null
    if (!xfrm || !file) return null

    const bytes = await file.async('uint8array')
    const kind = detectImageKind(bytes)
    if (!kind) {
      this.losses.unsupportedImages++ // EMF/WMF, típicos de PowerPoint antiguo
      return null
    }
    const image: ImageElement = {
      id: createId('el'),
      type: 'image',
      src: bytesToDataUrl(bytes, mimeForKind(kind)),
      alt: attr(path(picture, 'nvPicPr', 'cNvPr'), 'descr') ?? '',
      ...this.box(xfrm, transform)
    }
    const rotation = this.rotation(xfrm)
    return rotation ? { ...image, rotation } : image
  }

  /**
   * Tabla de PowerPoint (a:tbl) -> tabla de Tintero: texto, negrita, color y relleno por celda.
   * El estilo de tabla de PowerPoint (bandas, bordes) no se lee: la tabla usa el acento del tema.
   */
  private readTable(frame: Element, transform: Transform): TableElement | null {
    const graphicData = path(frame, 'graphic', 'graphicData')
    if (attr(graphicData, 'uri') !== TABLE_URI) return null
    const table = child(graphicData, 'tbl')
    const xfrm = child(frame, 'xfrm')
    if (!table || !xfrm) return null

    const gridWidths = childElements(child(table, 'tblGrid'), 'gridCol').map((column) => numberAttr(column, 'w') ?? 1)
    const total = gridWidths.reduce((sum, width) => sum + width, 0) || 1
    let fontSize: number | null = null
    const rows = childElements(table, 'tr').map((row) =>
      childElements(row, 'tc').map((cell): TableCell => {
        // Celdas tapadas por una combinada: quedan vacías (Tintero aún no combina celdas en tablas).
        if (attr(cell, 'hMerge') === '1' || attr(cell, 'vMerge') === '1') return { text: '' }
        if (Number(attr(cell, 'gridSpan') ?? 1) > 1 || Number(attr(cell, 'rowSpan') ?? 1) > 1) {
          this.losses.mergedTableCells++
        }
        const paragraphs = childElements(child(cell, 'txBody'), 'p')
        const firstRun = descendants(child(cell, 'txBody'), 'rPr')[0] ?? null
        const size = numberAttr(firstRun, 'sz')
        if (size && fontSize === null) fontSize = this.fontSizePx(size)
        const result: TableCell = { text: paragraphs.map(paragraphText).join('\n') }
        if (attr(firstRun, 'b') === '1') result.bold = true
        const color = this.resolveColor(child(firstRun, 'solidFill'))
        if (color) result.color = `#${color.toLowerCase()}`
        const fill = this.resolveColor(child(child(cell, 'tcPr'), 'solidFill'))
        if (fill) result.fill = `#${fill.toLowerCase()}`
        return result
      })
    )
    const columnCount = Math.max(gridWidths.length, ...rows.map((cells) => cells.length))
    if (rows.length === 0 || columnCount === 0) return null
    const paddedRows = rows.map((cells) => [
      ...cells,
      ...Array.from({ length: columnCount - cells.length }, () => ({ text: '' }))
    ])
    const element: TableElement = {
      id: createId('el'),
      type: 'table',
      ...this.box(xfrm, transform),
      rows: paddedRows,
      columnWidths: Array.from(
        { length: columnCount },
        (_, index) => (gridWidths[index] ?? total / columnCount) / total
      ),
      headerRow: attr(child(table, 'tblPr'), 'firstRow') === '1',
      fontSize: fontSize ?? this.fontSizePx(1800)
    }
    const rotation = this.rotation(xfrm)
    return rotation ? { ...element, rotation } : element
  }

  /** Giro en grados (PowerPoint lo guarda en 60000 de grado). El volteo no existe en Tintero. */
  private rotation(xfrm: Element): number {
    if (attr(xfrm, 'flipH') === '1' || attr(xfrm, 'flipV') === '1') this.losses.flipped++
    return normalizeRotation((numberAttr(xfrm, 'rot') ?? 0) / 60000)
  }

  /**
   * Sin tema importado (archivo mínimo), el fondo es el del tema Blanco: un texto casi blanco no se
   * vería, salvo dentro de una forma con relleno. Con el tema importado, el fondo es el real.
   */
  private isVisible(color: string, insideShape: boolean): boolean {
    return insideShape || this.importedTheme !== null || !isNearWhite(color)
  }

  private box(xfrm: Element, transform: Transform): Box {
    const off = child(xfrm, 'off')
    const ext = child(xfrm, 'ext')
    const x = transform.offsetX + (numberAttr(off, 'x') ?? 0) * transform.scaleX
    const y = transform.offsetY + (numberAttr(off, 'y') ?? 0) * transform.scaleY
    const width = (numberAttr(ext, 'cx') ?? 0) * transform.scaleX
    const height = (numberAttr(ext, 'cy') ?? 0) * transform.scaleY
    return {
      x: Math.round(this.offsetX + x * this.scale),
      y: Math.round(this.offsetY + y * this.scale),
      width: Math.max(1, Math.round(width * this.scale)),
      height: Math.max(1, Math.round(height * this.scale))
    }
  }

  private xml(filePath: string): Promise<Element | null> {
    let cached = this.xmlCache.get(filePath)
    if (!cached) {
      const file = this.zip.file(filePath)
      cached = file ? file.async('string').then(parseXml) : Promise.resolve(null)
      this.xmlCache.set(filePath, cached)
    }
    return cached
  }

  private async relationships(filePath: string): Promise<Map<string, Relationship>> {
    return readRelationships(await this.xml(relsPathFor(filePath)), filePath)
  }
}

interface SlideContext {
  slidePath: string
  rels: Map<string, Relationship>
  layout: Element | null
  master: Element | null
}

/**
 * Si todas las diapositivas tienen el mismo fondo propio (lo normal cuando el fondo está en el
 * diseño y no en el patrón, como hace pptxgenjs), ese fondo pasa a ser el del tema importado.
 * Así cambiar de tema y volver al importado no pierde nada.
 */
function liftSharedBackground(slides: Slide[], theme: SlideTheme): Slide[] {
  const shared = slides[0]?.background
  if (shared && slides.every((slide) => slide.background === shared)) theme.background = shared
  // Un fondo propio igual al del tema no aporta nada (LibreOffice lo escribe en cada diapositiva).
  return slides.map(({ background, ...slide }) =>
    background === undefined || background === theme.background ? slide : { ...slide, background }
  )
}

function findRelation(rels: Map<string, Relationship>, typeSuffix: string): string | null {
  for (const rel of rels.values()) if (rel.type.endsWith(typeSuffix)) return rel.target
  return null
}

function groupTransform(group: Element, parent: Transform): Transform {
  const xfrm = path(group, 'grpSpPr', 'xfrm')
  const off = child(xfrm, 'off')
  const ext = child(xfrm, 'ext')
  const childOff = child(xfrm, 'chOff')
  const childExt = child(xfrm, 'chExt')
  const scaleX = ratio(numberAttr(ext, 'cx'), numberAttr(childExt, 'cx'))
  const scaleY = ratio(numberAttr(ext, 'cy'), numberAttr(childExt, 'cy'))
  // Primero se aplica el grupo (hijo -> grupo) y después el padre (grupo -> diapositiva).
  const localX = (numberAttr(off, 'x') ?? 0) - (numberAttr(childOff, 'x') ?? 0) * scaleX
  const localY = (numberAttr(off, 'y') ?? 0) - (numberAttr(childOff, 'y') ?? 0) * scaleY
  return {
    offsetX: parent.offsetX + localX * parent.scaleX,
    offsetY: parent.offsetY + localY * parent.scaleY,
    scaleX: scaleX * parent.scaleX,
    scaleY: scaleY * parent.scaleY
  }
}

const ratio = (a: number | null, b: number | null) => (a && b ? a / b : 1)

/** Marcadores de posición del diseño y del patrón de los que hereda esta forma (posición, estilo...). */
function findInheritedPlaceholders(placeholder: Element, context: SlideContext): Element[] {
  const type = attr(placeholder, 'type') ?? 'body'
  const index = attr(placeholder, 'idx')
  const find = (root: Element | null, matchIndex: boolean) =>
    childElements(path(root, 'cSld', 'spTree'), 'sp').find((candidate) => {
      const candidatePh = path(candidate, 'nvSpPr', 'nvPr', 'ph')
      if (!candidatePh) return false
      if (matchIndex && index !== null) return attr(candidatePh, 'idx') === index
      return samePlaceholderType(attr(candidatePh, 'type') ?? 'body', type)
    })
  const fromLayout = find(context.layout, true) ?? find(context.layout, false)
  const fromMaster = find(context.master, false)
  return [fromLayout, fromMaster].filter((source): source is Element => Boolean(source))
}

function samePlaceholderType(a: string, b: string): boolean {
  const normalize = (type: string) =>
    type === 'ctrTitle' ? 'title' : type === 'subTitle' || type === 'obj' ? 'body' : type
  return normalize(a) === normalize(b)
}

function roleOf(placeholder: Element | null): TextRole {
  if (!placeholder) return 'free'
  const type = attr(placeholder, 'type') ?? 'body'
  if (type === 'title' || type === 'ctrTitle') return 'title'
  if (type === 'subTitle') return 'subtitle'
  if (type === 'body' || type === 'obj') return 'body'
  return 'free'
}

/**
 * Estilos de primer nivel (a:lvl1pPr) que se aplican a esta forma, del más concreto al más general:
 * la propia forma, el diseño, el patrón y los estilos de texto del patrón (título/cuerpo/otros).
 */
function styleSources(shape: Element, inherited: Element[], master: Element | null, role: TextRole): Element[] {
  const fromShapes = [shape, ...inherited].map((source) => path(source, 'txBody', 'lstStyle', 'lvl1pPr'))
  const masterStyle = role === 'title' ? 'titleStyle' : role === 'free' ? 'otherStyle' : 'bodyStyle'
  const fromMaster = path(master, 'txStyles', masterStyle, 'lvl1pPr')
  return [...fromShapes, fromMaster].filter((source): source is Element => Boolean(source))
}

function hasBullets(paragraph: Element | undefined, sources: Element[]): boolean {
  for (const pPr of [child(paragraph, 'pPr'), ...sources]) {
    if (child(pPr, 'buNone')) return false
    if (child(pPr, 'buChar') || child(pPr, 'buAutoNum')) return true
  }
  return false
}

function paragraphText(paragraph: Element): string {
  return childElements(paragraph)
    .map((node) => {
      if (node.localName === 'r' || node.localName === 'fld') return child(node, 't')?.textContent ?? ''
      if (node.localName === 'br') return '\n'
      return ''
    })
    .join('')
}

function fontOf(runProperties: Element | null): string | null {
  const typeface = attr(child(runProperties, 'latin'), 'typeface')
  // "+mj-lt"/"+mn-lt" son las fuentes del tema de PowerPoint: dejamos la del tema de Tintero.
  return typeface && !typeface.startsWith('+') ? typeface : null
}

function isNearWhite(hex: string): boolean {
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 220
}

const isSet = (value: string | null | undefined): value is string => value !== null && value !== undefined

function notesText(notes: Element | null): string {
  const body = childElements(path(notes, 'cSld', 'spTree'), 'sp').find(
    (shape) => attr(path(shape, 'nvSpPr', 'nvPr', 'ph'), 'type') === 'body'
  )
  return childElements(child(body, 'txBody'), 'p').map(paragraphText).join('\n').trim()
}

export function describeLosses(losses: Losses): string[] {
  const warnings: string[] = []
  if (losses.background) warnings.push('algunos fondos (se usa el del tema)')
  if (losses.charts > 0) warnings.push(plural(losses.charts, 'gráfico o SmartArt', 'gráficos o SmartArt'))
  if (losses.mergedTableCells > 0) {
    warnings.push(`${plural(losses.mergedTableCells, 'celda combinada', 'celdas combinadas')} de tablas (se separan)`)
  }
  if (losses.unsupportedShapes > 0) {
    warnings.push(
      `${plural(losses.unsupportedShapes, 'forma o línea', 'formas o líneas')} sin equivalente (se omiten o pasan a rectángulo)`
    )
  }
  if (losses.flipped > 0) warnings.push(`el volteo de ${plural(losses.flipped, 'elemento')}`)
  if (losses.unsupportedImages > 0) {
    warnings.push(`${plural(losses.unsupportedImages, 'imagen', 'imágenes')} en formatos antiguos (EMF/WMF)`)
  }
  if (losses.aspectRatio) {
    warnings.push(`el formato ${losses.aspectRatio === '4:3' ? '4:3' : 'de la diapositiva'} (se centra en 16:9)`)
  }
  return warnings
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
