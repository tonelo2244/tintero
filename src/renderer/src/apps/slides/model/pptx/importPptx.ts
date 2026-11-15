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
  relsPathFor,
  resolveZipPath
} from '@/core/office/xml'
import { createShapeElement, createTextElement } from '../factories'
import { normalizeParagraphs } from '../richText'
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Box,
  type HorizontalAlign,
  type ShapeKind,
  type Slide,
  type SlideElement,
  type Presentation,
  type RunFormat,
  type TextParagraph,
  type TextRole,
  type TextStyle,
  type VerticalAlign
} from '../types'

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
  notes: '/notesSlide',
  image: '/image'
} as const

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
  rotated: number
  unsupportedShapes: number
  tablesAndCharts: number
  unsupportedImages: number
  aspectRatio: string | null
}

interface Relationship {
  type: string
  target: string
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
    rotated: 0,
    unsupportedShapes: 0,
    tablesAndCharts: 0,
    unsupportedImages: 0,
    aspectRatio: null
  }
  /** EMU de PowerPoint -> unidades de Tintero (1280x720), centrando si el formato no es 16:9. */
  private scale = 1 / EMU_PER_PX
  private offsetX = 0
  private offsetY = 0

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

    const slides: Slide[] = []
    for (const slidePath of slidePaths) slides.push(await this.readSlide(slidePath))
    if (slides.length === 0) throw new Error('La presentación no tiene diapositivas.')

    return { content: { themeId: 'blank', slides }, warnings: describeLosses(this.losses) }
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

    if ([slide, layout, master].some(hasCustomBackground)) this.losses.background = true

    const context: SlideContext = { slidePath, rels, layout, master }
    const elements = await this.readShapeTree(path(slide, 'cSld', 'spTree'), context, IDENTITY)

    const notesPath = findRelation(rels, REL_TYPE.notes)
    const notes = notesPath ? notesText(await this.xml(notesPath)) : ''
    return { id: createId('slide'), layout: 'blank', elements, notes }
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
        case 'graphicFrame': // tablas, gráficos y SmartArt
          this.losses.tablesAndCharts++
          break
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
    if (numberAttr(xfrm, 'rot')) this.losses.rotated++
    const box = this.box(xfrm, transform)

    const elements: SlideElement[] = []
    const shapeElement = this.readGeometry(shape, box)
    if (shapeElement) elements.push(shapeElement)

    const text = this.readText(shape, placeholder, inherited, context, box, shapeElement !== null)
    if (text) elements.push(text)
    return elements
  }

  /** Forma visible (con relleno o borde). Un cuadro de texto transparente no genera forma. */
  private readGeometry(shape: Element, box: Box): SlideElement | null {
    const spPr = child(shape, 'spPr')
    const preset = attr(child(spPr, 'prstGeom'), 'prst')
    const solidFill = colorOf(child(spPr, 'solidFill'))
    const themeFill = Number(attr(path(shape, 'style', 'fillRef'), 'idx') ?? 0) > 0
    const hasFill = !child(spPr, 'noFill') && (solidFill !== null || themeFill || Boolean(child(spPr, 'gradFill')))
    const line = child(spPr, 'ln')
    const lineColor = child(line, 'noFill') ? null : colorOf(child(line, 'solidFill'))
    if (!hasFill && !lineColor) return null

    let kind = preset ? SHAPES_BY_PRESET[preset] : undefined
    if (!kind) {
      this.losses.unsupportedShapes++
      kind = 'rect'
    }
    const element = createShapeElement(kind, box)
    element.style = {
      // Sin color propio = color del tema de PowerPoint -> color de acento del tema de Tintero.
      fill: hasFill ? solidFill && `#${solidFill}` : null,
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
    const color = colorOf(child(firstRun, 'solidFill')) ?? (insideShape ? themeTextColor(shape) : null)
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
      // Sin el fondo de PowerPoint, un texto casi blanco sería invisible sobre el tema Blanco
      // (salvo dentro de una forma con relleno, que sí se importa).
      color: color && (insideShape || !isNearWhite(color)) ? `#${color}` : null,
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
    const color = colorOf(child(rPr, 'solidFill'))
    if (color && (insideShape || !isNearWhite(color)) && `#${color}` !== style.color) format.color = `#${color}`
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
    if (numberAttr(xfrm, 'rot')) this.losses.rotated++
    return {
      id: createId('el'),
      type: 'image' as const,
      src: bytesToDataUrl(bytes, mimeForKind(kind)),
      alt: attr(path(picture, 'nvPicPr', 'cNvPr'), 'descr') ?? '',
      ...this.box(xfrm, transform)
    }
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
    const rels = await this.xml(relsPathFor(filePath))
    const map = new Map<string, Relationship>()
    for (const rel of childElements(rels, 'Relationship')) {
      const id = attr(rel, 'Id')
      const target = attr(rel, 'Target')
      if (id && target && attr(rel, 'TargetMode') !== 'External') {
        map.set(id, { type: attr(rel, 'Type') ?? '', target: resolveZipPath(filePath, target) })
      }
    }
    return map
  }
}

interface SlideContext {
  slidePath: string
  rels: Map<string, Relationship>
  layout: Element | null
  master: Element | null
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

/** Solo colores RGB explícitos; los del tema de PowerPoint pasan a ser los del tema de Tintero. */
function colorOf(fill: Element | null): string | null {
  const value = attr(child(fill, 'srgbClr'), 'val')
  return value && /^[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : null
}

/** Las formas de PowerPoint suelen llevar texto en el color claro del tema (lt1) sobre su relleno. */
function themeTextColor(shape: Element): string | null {
  const scheme = attr(child(path(shape, 'style', 'fontRef'), 'schemeClr'), 'val')
  return scheme === 'lt1' || scheme === 'bg1' ? 'FFFFFF' : null
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

/** Un fondo que no sea blanco liso (color, degradado, imagen). */
function hasCustomBackground(root: Element | null): boolean {
  const background = path(root, 'cSld', 'bg')
  if (!background) return false
  if (descendants(background, 'gradFill').length || descendants(background, 'blipFill').length) return true
  if (descendants(background, 'pattFill').length) return true
  const rgb = attr(descendants(background, 'srgbClr')[0], 'val')
  if (rgb) return rgb.toUpperCase() !== 'FFFFFF'
  const scheme = attr(descendants(background, 'schemeClr')[0], 'val')
  return scheme !== null && scheme !== 'bg1' && scheme !== 'lt1'
}

function notesText(notes: Element | null): string {
  const body = childElements(path(notes, 'cSld', 'spTree'), 'sp').find(
    (shape) => attr(path(shape, 'nvSpPr', 'nvPr', 'ph'), 'type') === 'body'
  )
  return childElements(child(body, 'txBody'), 'p').map(paragraphText).join('\n').trim()
}

export function describeLosses(losses: Losses): string[] {
  const warnings: string[] = []
  if (losses.background) warnings.push('el fondo y los colores del tema (se aplica el tema Blanco)')
  if (losses.tablesAndCharts > 0) {
    warnings.push(`${plural(losses.tablesAndCharts, 'tabla, gráfico o SmartArt', 'tablas, gráficos o SmartArt')}`)
  }
  if (losses.unsupportedShapes > 0) {
    warnings.push(
      `${plural(losses.unsupportedShapes, 'forma o línea', 'formas o líneas')} sin equivalente (se omiten o pasan a rectángulo)`
    )
  }
  if (losses.rotated > 0) warnings.push(`el giro de ${plural(losses.rotated, 'elemento')}`)
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
