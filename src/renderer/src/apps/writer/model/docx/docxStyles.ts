import {
  AlignmentType,
  BorderStyle,
  LevelFormat,
  type ICharacterStyleOptions,
  type ILevelsOptions,
  type IParagraphStyleOptions,
  type IParagraphStylePropertiesOptions,
  type IRunStylePropertiesOptions,
  type IStylesOptions
} from 'docx'
import { cssFontToName } from '@/core/office/cssValues'
import { BULLET_STYLES, type NumberFormat } from '../paragraphFormat'
import { findStyle, headingLevelOf, NORMAL_STYLE_ID, type StyleProps, type WriterStyle } from '../styles'

/**
 * Estilos y listas del .docx que genera Tintero. Desde la fase 13 los estilos salen de los del
 * documento (model/styles.ts), no de una lista fija.
 */

/** Unidades de Word: twips (1/20 de punto, 1440 por pulgada) y medios puntos para el tamaño de letra. */
export const twips = (cm: number) => Math.round((cm * 1440) / 2.54)
export const halfPoints = (pt: number) => Math.round(pt * 2)
/** Interlineado "múltiple" de Word: 240 = sencillo. */
const LINE_UNITS = 240

/** Estilos fijos del exportador que no son estilos del documento (citas en bloque y código). */
export const DOCX_STYLE = {
  blockQuote: 'BlockText',
  code: 'HTMLPreformatted'
} as const

/**
 * Id y nombre de Word de cada estilo integrado de Tintero. Son los de Word ("Heading 1", "Title",
 * "Quote"...): así el documento se ve bien en cualquier suite y, al importarlo, se reconocen por
 * nombre (docxStylesImport.ts usa esta misma tabla al revés).
 */
export const WORD_BUILT_IN_STYLES: Record<string, { id: string; name: string }> = {
  normal: { id: 'Normal', name: 'Normal' },
  'no-spacing': { id: 'NoSpacing', name: 'No Spacing' },
  'heading-1': { id: 'Heading1', name: 'Heading 1' },
  'heading-2': { id: 'Heading2', name: 'Heading 2' },
  'heading-3': { id: 'Heading3', name: 'Heading 3' },
  'heading-4': { id: 'Heading4', name: 'Heading 4' },
  'heading-5': { id: 'Heading5', name: 'Heading 5' },
  'heading-6': { id: 'Heading6', name: 'Heading 6' },
  title: { id: 'Title', name: 'Title' },
  subtitle: { id: 'Subtitle', name: 'Subtitle' },
  quote: { id: 'Quote', name: 'Quote' },
  emphasis: { id: 'Emphasis', name: 'Emphasis' },
  'intense-emphasis': { id: 'IntenseEmphasis', name: 'Intense Emphasis' },
  strong: { id: 'Strong', name: 'Strong' }
}

/** Id de Word de un estilo de Tintero. Los propios: sin guiones ("custom-nota" -> "customnota"). */
export function docxStyleId(styleId: string): string {
  return WORD_BUILT_IN_STYLES[styleId]?.id ?? styleId.replace(/[^a-z0-9]/gi, '')
}

export const HEADINGS_NUMBERING_REFERENCE = 'tintero-headings'

type StyleOptions = { run: IRunStylePropertiesOptions; paragraph: IParagraphStylePropertiesOptions }

/** Propiedades de un estilo -> formato de Word. Solo lo que el estilo define: el resto se hereda. */
export function styleFormatting(props: StyleProps, numberingLevel?: number): StyleOptions {
  const run: { -readonly [K in keyof IRunStylePropertiesOptions]: IRunStylePropertiesOptions[K] } = {}
  const font = cssFontToName(props.fontFamily)
  if (font) run.font = font
  if (props.fontSize) run.size = halfPoints(props.fontSize)
  if (props.color) run.color = props.color.replace('#', '').toUpperCase()
  if (props.bold !== undefined) run.bold = props.bold
  if (props.italic !== undefined) run.italics = props.italic
  if (props.underline) run.underline = {}

  const paragraph: { -readonly [K in keyof IParagraphStylePropertiesOptions]: IParagraphStylePropertiesOptions[K] } = {}
  if (props.align) paragraph.alignment = ALIGNMENT[props.align]
  const spacing: { before?: number; after?: number; line?: number } = {}
  if (props.spaceBefore !== undefined) spacing.before = Math.round(props.spaceBefore * 20)
  if (props.spaceAfter !== undefined) spacing.after = Math.round(props.spaceAfter * 20)
  if (props.lineHeight) spacing.line = Math.round(props.lineHeight * LINE_UNITS)
  if (Object.keys(spacing).length > 0) paragraph.spacing = spacing
  const indent: { left?: number; right?: number; firstLine?: number; hanging?: number } = {}
  if (props.indentLeft !== undefined) indent.left = twips(props.indentLeft)
  if (props.indentRight !== undefined) indent.right = twips(props.indentRight)
  if (props.firstLine) {
    if (props.firstLine > 0) indent.firstLine = twips(props.firstLine)
    else indent.hanging = twips(-props.firstLine)
  }
  if (Object.keys(indent).length > 0) paragraph.indent = indent
  if (props.outlineLevel) paragraph.outlineLevel = props.outlineLevel - 1
  if (numberingLevel !== undefined) {
    paragraph.numbering = { reference: HEADINGS_NUMBERING_REFERENCE, level: numberingLevel }
  }
  return { run, paragraph }
}

export const ALIGNMENT = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
} as const

/**
 * styles.xml a partir de los estilos del documento: Normal va en los valores por defecto, los
 * títulos y el Título en los integrados de la librería, y el resto como estilos de párrafo o de
 * carácter con su "basado en". Con `numberedHeadings`, los títulos llevan la lista multinivel en
 * el propio estilo, como hace Word con "Lista vinculada a títulos".
 */
export function docxStylesFor(styles: WriterStyle[], numberedHeadings = false): IStylesOptions {
  const normal = findStyle(styles, NORMAL_STYLE_ID)
  const builtIn: Record<string, StyleOptions> = {}
  const paragraphStyles: IParagraphStyleOptions[] = []
  const characterStyles: ICharacterStyleOptions[] = []

  for (const style of styles) {
    if (style.id === NORMAL_STYLE_ID) continue
    const level = headingLevelOf(style.id)
    const formatting = styleFormatting(style.props, numberedHeadings && level ? level - 1 : undefined)
    if (level || style.id === 'title') {
      builtIn[level ? `heading${level}` : 'title'] = formatting
      continue
    }
    const word = WORD_BUILT_IN_STYLES[style.id]
    const common = {
      id: docxStyleId(style.id),
      name: word?.name ?? style.name,
      basedOn: style.basedOn ? docxStyleId(style.basedOn) : undefined,
      quickFormat: style.quick,
      run: formatting.run
    }
    if (style.type === 'character') {
      characterStyles.push(common)
    } else {
      paragraphStyles.push({
        ...common,
        basedOn: common.basedOn ?? 'Normal',
        next: style.next ? docxStyleId(style.next) : undefined,
        paragraph: formatting.paragraph
      })
    }
  }

  const document = styleFormatting(normal?.props ?? {})
  return {
    default: { document, ...builtIn },
    paragraphStyles: [...paragraphStyles, ...FIXED_PARAGRAPH_STYLES],
    characterStyles
  }
}

/** Citas en bloque y código: formato del editor que no es un estilo del documento. */
const FIXED_PARAGRAPH_STYLES: IParagraphStyleOptions[] = [
  {
    id: DOCX_STYLE.blockQuote,
    name: 'Block Text',
    basedOn: 'Normal',
    run: { color: '444444' },
    paragraph: {
      indent: { left: 240 },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C8C8C8', space: 8 } }
    }
  },
  {
    id: DOCX_STYLE.code,
    name: 'HTML Preformatted',
    basedOn: 'Normal',
    run: { font: 'Courier New', size: halfPoints(10.5) },
    paragraph: { spacing: { after: 0, line: 240 }, shading: { type: 'clear', fill: 'F4F4F4', color: 'auto' } }
  }
]

const LIST_LEVELS = 9
const BULLET_SYMBOLS = ['•', '◦', '▪']
const NUMBER_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN]

const levelIndent = (level: number) => ({ left: 720 * (level + 1), hanging: 360 })

/** Una lista de viñetas por símbolo elegido en la biblioteca ("disc" es la de siempre). */
export const bulletListReference = (bulletId = 'disc') =>
  bulletId === 'disc' ? 'tintero-bullets' : `tintero-bullets-${bulletId}`
/** Word guarda el número inicial y el formato en la definición de la lista: una por combinación. */
export const numberedListReference = (start: number, format: NumberFormat = 'decimal') =>
  format === 'decimal' ? `tintero-numbers-${start}` : `tintero-numbers-${format}-${start}`

/** El símbolo elegido va en el primer nivel; los anidados siguen la rotación de siempre. */
export function bulletLevels(bulletId = 'disc'): ILevelsOptions[] {
  const symbol = BULLET_STYLES.find((bullet) => bullet.id === bulletId)?.symbol ?? BULLET_SYMBOLS[0]
  return Array.from({ length: LIST_LEVELS }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: level === 0 ? symbol : BULLET_SYMBOLS[level % BULLET_SYMBOLS.length],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: levelIndent(level) } }
  }))
}

/** Formato de número de Word (numFmt) y texto del primer nivel para cada formato de Tintero. */
const NUMBER_FORMAT_LEVEL: Record<
  Exclude<NumberFormat, 'legal'>,
  { format: (typeof LevelFormat)[keyof typeof LevelFormat]; suffix: string }
> = {
  decimal: { format: LevelFormat.DECIMAL, suffix: '.' },
  'decimal-paren': { format: LevelFormat.DECIMAL, suffix: ')' },
  'lower-alpha': { format: LevelFormat.LOWER_LETTER, suffix: '.' },
  'lower-alpha-paren': { format: LevelFormat.LOWER_LETTER, suffix: ')' },
  'upper-alpha': { format: LevelFormat.UPPER_LETTER, suffix: '.' },
  'lower-roman': { format: LevelFormat.LOWER_ROMAN, suffix: '.' },
  'upper-roman': { format: LevelFormat.UPPER_ROMAN, suffix: '.' }
}

export function numberedLevels(start: number, numberFormat: NumberFormat = 'decimal'): ILevelsOptions[] {
  return Array.from({ length: LIST_LEVELS }, (_, level) => {
    const first = numberFormat === 'legal' ? null : NUMBER_FORMAT_LEVEL[numberFormat]
    return {
      level,
      // Legal: 1., 1.1., 1.1.1. (cada nivel repite los de arriba).
      format:
        first && level === 0
          ? first.format
          : numberFormat === 'legal'
            ? LevelFormat.DECIMAL
            : NUMBER_FORMATS[level % NUMBER_FORMATS.length],
      text: numberFormat === 'legal' ? legalText(level) : `%${level + 1}${level === 0 && first ? first.suffix : '.'}`,
      start: level === 0 ? start : 1,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: levelIndent(level) } }
    }
  })
}

/** Títulos numerados: 1, 1.1, 1.1.1... sin sangría (la numeración va delante del texto del título). */
export function headingLevels(): ILevelsOptions[] {
  return Array.from({ length: 6 }, (_, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: legalText(level),
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 0, hanging: 0 } } }
  }))
}

const legalText = (level: number) => Array.from({ length: level + 1 }, (_, index) => `%${index + 1}`).join('.') + '.'
