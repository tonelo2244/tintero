import { attr, child, childElements, parseXml, path } from '@/core/office/xml'
import { cssFontFamilyFor } from '@/ui/fonts'
import {
  customStyleId,
  DEFAULT_STYLES,
  findStyle,
  NORMAL_STYLE_ID,
  normalizeStyles,
  type StyleAlign,
  type StyleProps,
  type StyleType,
  type WriterStyle
} from '../styles'
import { WORD_BUILT_IN_STYLES } from './docxStyles'

/**
 * Lectura de `word/styles.xml` (fase 13): los estilos del .docx pasan a ser los del documento.
 *
 *   - Los integrados (Normal, Heading 1..6, Title, Quote...) se reconocen por NOMBRE, que es lo que
 *     comparten Word, LibreOffice y Google Docs (los ids cambian con el idioma de la suite). Se
 *     quedan con su nombre en español y toman las propiedades del archivo.
 *   - Los propios del autor se importan solo si el documento los usa (o heredan de uno usado): un
 *     .docx de Word trae decenas de estilos latentes que solo serían ruido en la galería.
 *
 * Devuelve también las reglas para mammoth que convierten cada estilo en la clase que después
 * `prepareHtml` cambia por `data-style` / `data-char-style`.
 */

export interface DocxStyleImport {
  styles: WriterStyle[]
  /** Reglas extra del mapa de estilos de mammoth. */
  styleMap: string[]
  /** Los títulos llevan numeración en su estilo (lista multinivel vinculada a títulos). */
  numberedHeadings: boolean
}

export const PARAGRAPH_STYLE_CLASS = 'tstyle-'
export const CHARACTER_STYLE_CLASS = 'tchar-'

/** Estilos de Word que son mecánica de la suite, no estilos que el usuario elija. */
const IGNORED_STYLE =
  /^(list paragraph|hyperlink|followedhyperlink|block text|html preformatted|intense quote|default paragraph font|normal table|no list|table grid|header|footer|balloon text|caption|toc ?\d|annotation .*|comment .*|footnote .*|endnote .*|.* char)$/i

/** Lo que Word supone cuando no hay nada escrito (ECMA-376): sin espacios, interlineado sencillo, 10 pt. */
const WORD_IMPLICIT: StyleProps = {
  fontSize: 10,
  color: '#000000',
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  spaceBefore: 0,
  spaceAfter: 0,
  lineHeight: 1,
  indentLeft: 0,
  indentRight: 0,
  firstLine: 0
}

const TWIPS_PER_CM = 1440 / 2.54
const round2 = (value: number) => Math.round(value * 100) / 100

const ALIGNMENTS: Record<string, StyleAlign> = {
  left: 'left',
  start: 'left',
  center: 'center',
  right: 'right',
  end: 'right',
  both: 'justify',
  distribute: 'justify'
}

interface WordStyle {
  id: string
  name: string
  type: StyleType
  basedOn: string | null
  next: string | null
  props: StyleProps
  numbered: boolean
}

/** Nombre de Word (en minúsculas) -> id de Tintero, para los integrados. */
const BUILT_IN_BY_NAME = new Map(
  Object.entries(WORD_BUILT_IN_STYLES).map(([tinteroId, word]) => [word.name.toLowerCase(), tinteroId])
)

/**
 * `usedStyleIds`: ids de Word que aparecen en document.xml (w:pStyle y w:rStyle). Si no hay
 * styles.xml, null: el documento se queda con los estilos de partida.
 */
export function readDocxStyles(stylesXml: string | null, usedStyleIds: ReadonlySet<string>): DocxStyleImport | null {
  if (!stylesXml) return null
  const root = parseXml(stylesXml)
  const wordStyles = new Map<string, WordStyle>()
  for (const element of childElements(root, 'style')) {
    const style = readWordStyle(element)
    if (style) wordStyles.set(style.id, style)
  }

  // Ids de Word -> ids de Tintero. Primero los integrados (por nombre), después los propios usados.
  const tinteroIds = new Map<string, string>()
  for (const style of wordStyles.values()) {
    const builtIn = BUILT_IN_BY_NAME.get(style.name.toLowerCase())
    if (builtIn && isCompatible(builtIn, style.type)) tinteroIds.set(style.id, builtIn)
  }
  const custom: WordStyle[] = []
  for (const id of withAncestors(usedStyleIds, wordStyles)) {
    const style = wordStyles.get(id)
    if (!style || tinteroIds.has(id) || IGNORED_STYLE.test(style.name) || /'/.test(style.name)) continue
    custom.push(style)
  }
  const styles: WriterStyle[] = DEFAULT_STYLES.map((style) => ({ ...style }))
  for (const style of custom) {
    const id = customStyleId(style.name, styles)
    tinteroIds.set(style.id, id)
    styles.push({ id, name: style.name, type: style.type, quick: true, props: style.props })
  }

  const defaults = readDefaults(root)
  for (const [wordId, tinteroId] of tinteroIds) {
    const word = wordStyles.get(wordId)!
    const index = styles.findIndex((style) => style.id === tinteroId)
    const props =
      tinteroId === NORMAL_STYLE_ID ? { ...WORD_IMPLICIT, ...keepFont(), ...defaults, ...word.props } : word.props
    const current = styles[index]
    styles[index] = findStyle(DEFAULT_STYLES, tinteroId)
      ? { ...current, props }
      : {
          ...current,
          props,
          basedOn: word.basedOn ? tinteroIds.get(word.basedOn) : undefined,
          next: word.next ? tinteroIds.get(word.next) : undefined
        }
  }
  // Un archivo sin estilo Normal propio sigue teniendo valores por defecto del documento.
  if (![...tinteroIds.values()].includes(NORMAL_STYLE_ID)) {
    const index = styles.findIndex((style) => style.id === NORMAL_STYLE_ID)
    styles[index] = { ...styles[index], props: { ...WORD_IMPLICIT, ...keepFont(), ...defaults } }
  }

  const styleMap = custom.map((style) => {
    const id = tinteroIds.get(style.id)!
    return style.type === 'character'
      ? `r[style-name='${style.name}'] => span.${CHARACTER_STYLE_CLASS}${id}`
      : `p[style-name='${style.name}'] => p.${PARAGRAPH_STYLE_CLASS}${id}:fresh`
  })
  for (const [tinteroId, word] of Object.entries(WORD_BUILT_IN_STYLES)) {
    if (findStyle(DEFAULT_STYLES, tinteroId)?.type === 'character') {
      styleMap.push(`r[style-name='${word.name}'] => span.${CHARACTER_STYLE_CLASS}${tinteroId}`)
    }
  }

  const heading1 = [...wordStyles.values()].find((style) => tinteroIds.get(style.id) === 'heading-1')
  return {
    styles: normalizeStyles(styles) ?? DEFAULT_STYLES,
    styleMap,
    numberedHeadings: heading1?.numbered ?? false
  }
}

/** La fuente de Normal: si Word no dice nada, se queda la de Tintero (Word supondría Times New Roman). */
function keepFont(): StyleProps {
  const fontFamily = findStyle(DEFAULT_STYLES, NORMAL_STYLE_ID)?.props.fontFamily
  return fontFamily ? { fontFamily } : {}
}

function isCompatible(tinteroId: string, type: StyleType): boolean {
  return findStyle(DEFAULT_STYLES, tinteroId)?.type === type
}

function withAncestors(ids: ReadonlySet<string>, styles: ReadonlyMap<string, WordStyle>): string[] {
  const result: string[] = []
  const pending = [...ids]
  while (pending.length > 0) {
    const id = pending.pop()!
    if (result.includes(id)) continue
    result.push(id)
    const parent = styles.get(id)?.basedOn
    if (parent) pending.push(parent)
  }
  // Los padres antes que los hijos: así un "basado en" siempre apunta a algo ya creado.
  return result.reverse()
}

function readWordStyle(element: Element): WordStyle | null {
  const type = attr(element, 'type')
  const id = attr(element, 'styleId')
  const name = attr(child(element, 'name'), 'val')
  if ((type !== 'paragraph' && type !== 'character') || !id || !name) return null
  const paragraphProps = child(element, 'pPr')
  return {
    id,
    name,
    type,
    basedOn: attr(child(element, 'basedOn'), 'val'),
    next: attr(child(element, 'next'), 'val'),
    props: { ...readParagraphProps(paragraphProps), ...readRunProps(child(element, 'rPr')) },
    numbered: child(paragraphProps, 'numPr') !== null
  }
}

/** `w:docDefaults`: lo que vale para todo el documento si un estilo no dice otra cosa. */
function readDefaults(root: Element): StyleProps {
  return {
    ...readParagraphProps(path(root, 'docDefaults', 'pPrDefault', 'pPr')),
    ...readRunProps(path(root, 'docDefaults', 'rPrDefault', 'rPr'))
  }
}

const isOn = (element: Element | null): boolean | undefined =>
  element ? !['0', 'false', 'off'].includes(attr(element, 'val') ?? '') : undefined

function readRunProps(properties: Element | null): StyleProps {
  if (!properties) return {}
  const props: StyleProps = {}
  const fonts = child(properties, 'rFonts')
  const font = attr(fonts, 'ascii') ?? attr(fonts, 'hAnsi')
  if (font) props.fontFamily = cssFontFamilyFor(font)
  const halfPoints = Number(attr(child(properties, 'sz'), 'val'))
  if (halfPoints > 0) props.fontSize = halfPoints / 2
  const color = attr(child(properties, 'color'), 'val')
  if (color && /^[0-9a-f]{6}$/i.test(color)) props.color = `#${color.toLowerCase()}`
  const bold = isOn(child(properties, 'b'))
  if (bold !== undefined) props.bold = bold
  const italic = isOn(child(properties, 'i'))
  if (italic !== undefined) props.italic = italic
  const underline = attr(child(properties, 'u'), 'val')
  if (underline !== null) props.underline = underline !== 'none'
  return props
}

function readParagraphProps(properties: Element | null): StyleProps {
  if (!properties) return {}
  const props: StyleProps = {}
  const align = ALIGNMENTS[attr(child(properties, 'jc'), 'val') ?? '']
  if (align) props.align = align
  const spacing = child(properties, 'spacing')
  const points = (name: string) => {
    const value = attr(spacing, name)
    return value === null || !Number.isFinite(Number(value)) ? undefined : Number(value) / 20
  }
  const before = points('before')
  if (before !== undefined) props.spaceBefore = before
  const after = points('after')
  if (after !== undefined) props.spaceAfter = after
  const line = Number(attr(spacing, 'line'))
  // Solo el interlineado "múltiple" (auto) se traduce; uno exacto en puntos no tiene equivalente.
  if (line > 0 && (attr(spacing, 'lineRule') ?? 'auto') === 'auto') props.lineHeight = round2(line / 240)
  const indent = child(properties, 'ind')
  const cm = (...names: string[]) => {
    for (const name of names) {
      const value = attr(indent, name)
      if (value !== null && Number.isFinite(Number(value))) return round2(Number(value) / TWIPS_PER_CM)
    }
    return undefined
  }
  const left = cm('left', 'start')
  if (left !== undefined) props.indentLeft = left
  const right = cm('right', 'end')
  if (right !== undefined) props.indentRight = right
  const hanging = cm('hanging')
  const firstLine = cm('firstLine')
  if (hanging) props.firstLine = -hanging
  else if (firstLine !== undefined) props.firstLine = firstLine
  const outline = Number(attr(child(properties, 'outlineLvl'), 'val'))
  if (
    Number.isInteger(outline) &&
    outline >= 0 &&
    outline < 9 &&
    attr(child(properties, 'outlineLvl'), 'val') !== null
  ) {
    props.outlineLevel = outline + 1
  }
  return props
}

/** Ids de estilo (w:pStyle, w:rStyle) que usa el cuerpo del documento. */
export function usedStyleIds(documentRoot: Element): Set<string> {
  const ids = new Set<string>()
  for (const name of ['pStyle', 'rStyle']) {
    for (const element of documentRoot.getElementsByTagNameNS('*', name)) {
      const value = attr(element, 'val')
      if (value) ids.add(value)
    }
  }
  return ids
}
