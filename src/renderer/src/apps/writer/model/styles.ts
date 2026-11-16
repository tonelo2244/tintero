import { FONT_FAMILIES } from '@/ui/fonts'

/**
 * Estilos como datos del documento (fase 13).
 *
 * Antes, "Título 1" era un botón que ponía un <h1>, y su aspecto vivía en global.css: el documento
 * no sabía qué era un Título 1. Ahora cada estilo es un objeto con sus propiedades, el documento
 * guarda la lista y la pantalla se pinta con CSS GENERADO a partir de ella. Cambiar el estilo cambia
 * todos los párrafos que lo usan sin tocar un solo nodo: es lo mismo que hace un sistema de diseño
 * con sus tokens.
 *
 * Los nodos solo dicen QUÉ estilo tienen (`<h2>`, `data-style="quote"`, `data-char-style`); el
 * CÓMO está aquí. El formato aplicado a mano (atributos de párrafo, marcas) sigue mandando sobre
 * el estilo, igual que en Word.
 */

export type StyleType = 'paragraph' | 'character'
export type StyleAlign = 'left' | 'center' | 'right' | 'justify'

/** Propiedades de un estilo. Todas opcionales: lo que falta se hereda del estilo "basado en". */
export interface StyleProps {
  /** Valor CSS de `font-family` (el mismo que usa el selector de fuentes). */
  fontFamily?: string
  /** Puntos. */
  fontSize?: number
  /** "#rrggbb". */
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: StyleAlign
  /** Puntos. */
  spaceBefore?: number
  spaceAfter?: number
  /** Múltiplo del tamaño de letra (1,15 = interlineado 1,15). */
  lineHeight?: number
  /** Centímetros. */
  indentLeft?: number
  indentRight?: number
  firstLine?: number
  /** Nivel de esquema (1–9): lo usan la navegación y la tabla de contenido. */
  outlineLevel?: number
}

export interface WriterStyle {
  id: string
  name: string
  type: StyleType
  basedOn?: string
  /** Estilo del párrafo siguiente al pulsar Intro (solo informativo en el editor; va al .docx). */
  next?: string
  /** Sale en la galería de Inicio. */
  quick?: boolean
  props: StyleProps
}

export const NORMAL_STYLE_ID = 'normal'
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const
export type HeadingLevel = (typeof HEADING_LEVELS)[number]
export const headingStyleId = (level: number) => `heading-${level}`
export function headingLevelOf(styleId: string): HeadingLevel | null {
  const match = /^heading-([1-6])$/.exec(styleId)
  return match ? (Number(match[1]) as HeadingLevel) : null
}

const BODY_FONT = FONT_FAMILIES[2].value // Calibri o equivalente
const HEADING_BLUE = '#2f5496'
const HEADING_DARK = '#1f3763'

const heading = (level: HeadingLevel, props: StyleProps): WriterStyle => ({
  id: headingStyleId(level),
  name: `Título ${level}`,
  type: 'paragraph',
  basedOn: NORMAL_STYLE_ID,
  next: NORMAL_STYLE_ID,
  ...(level <= 3 ? { quick: true } : {}),
  props: { bold: false, outlineLevel: level, ...props }
})

/**
 * Estilos de partida. Reproducen el aspecto que Texto tenía en global.css antes de la fase 13, así
 * un documento antiguo se ve igual.
 */
export const DEFAULT_STYLES: WriterStyle[] = [
  {
    id: NORMAL_STYLE_ID,
    name: 'Normal',
    type: 'paragraph',
    quick: true,
    props: {
      fontFamily: BODY_FONT,
      fontSize: 12,
      color: '#111111',
      bold: false,
      italic: false,
      underline: false,
      align: 'left',
      spaceBefore: 0,
      spaceAfter: 8,
      lineHeight: 1.3,
      indentLeft: 0,
      indentRight: 0,
      firstLine: 0
    }
  },
  {
    id: 'no-spacing',
    name: 'Sin espaciado',
    type: 'paragraph',
    basedOn: NORMAL_STYLE_ID,
    quick: true,
    props: { spaceBefore: 0, spaceAfter: 0 }
  },
  heading(1, { fontSize: 16, color: HEADING_BLUE, spaceBefore: 18, spaceAfter: 6 }),
  heading(2, { fontSize: 13, color: HEADING_BLUE, spaceBefore: 12, spaceAfter: 4 }),
  heading(3, { fontSize: 12, color: HEADING_DARK, spaceBefore: 10, spaceAfter: 4 }),
  heading(4, { fontSize: 12, color: HEADING_BLUE, italic: true, spaceBefore: 10, spaceAfter: 2 }),
  heading(5, { fontSize: 12, color: HEADING_BLUE, spaceBefore: 8, spaceAfter: 2 }),
  heading(6, { fontSize: 12, color: HEADING_DARK, italic: true, spaceBefore: 8, spaceAfter: 2 }),
  {
    id: 'title',
    name: 'Título',
    type: 'paragraph',
    basedOn: NORMAL_STYLE_ID,
    next: NORMAL_STYLE_ID,
    quick: true,
    props: { fontSize: 28, lineHeight: 1.1, spaceAfter: 4 }
  },
  {
    id: 'subtitle',
    name: 'Subtítulo',
    type: 'paragraph',
    basedOn: NORMAL_STYLE_ID,
    next: NORMAL_STYLE_ID,
    quick: true,
    props: { fontSize: 14, color: '#5a5a5a', spaceAfter: 14 }
  },
  {
    id: 'quote',
    name: 'Cita',
    type: 'paragraph',
    basedOn: NORMAL_STYLE_ID,
    next: NORMAL_STYLE_ID,
    quick: true,
    props: {
      italic: true,
      color: '#404040',
      align: 'center',
      spaceBefore: 12,
      spaceAfter: 12,
      indentLeft: 1.5,
      indentRight: 1.5
    }
  },
  { id: 'emphasis', name: 'Énfasis', type: 'character', quick: true, props: { italic: true } },
  {
    id: 'intense-emphasis',
    name: 'Énfasis intenso',
    type: 'character',
    quick: true,
    props: { italic: true, color: HEADING_BLUE }
  },
  { id: 'strong', name: 'Texto destacado', type: 'character', quick: true, props: { bold: true } }
]

export const BUILT_IN_STYLE_IDS = new Set(DEFAULT_STYLES.map((style) => style.id))
export const isBuiltInStyle = (id: string) => BUILT_IN_STYLE_IDS.has(id)

export function findStyle(styles: WriterStyle[], id: string): WriterStyle | undefined {
  return styles.find((style) => style.id === id)
}

/**
 * Propiedades efectivas de un estilo: las suyas sobre las de su cadena "basado en". Un estilo de
 * párrafo sin "basado en" hereda de Normal; los de carácter solo de su cadena. Un ciclo (A basado
 * en B basado en A, que se puede escribir a mano en un archivo) no cuelga: se corta.
 */
export function resolveStyle(styles: WriterStyle[], id: string): StyleProps {
  const chain: WriterStyle[] = []
  const seen = new Set<string>()
  let current = findStyle(styles, id)
  while (current && !seen.has(current.id)) {
    chain.unshift(current)
    seen.add(current.id)
    const parentId =
      current.basedOn ?? (current.type === 'paragraph' && current.id !== NORMAL_STYLE_ID ? NORMAL_STYLE_ID : undefined)
    current = parentId ? findStyle(styles, parentId) : undefined
  }
  return chain.reduce<StyleProps>((props, style) => ({ ...props, ...style.props }), {})
}

/** Selector CSS de los bloques o textos con el estilo. */
export function styleSelector(style: WriterStyle): string {
  const scope = '.writer-content'
  if (style.type === 'character') return `${scope} [data-char-style='${style.id}']`
  const level = headingLevelOf(style.id)
  if (level) return `${scope} h${level}`
  // Normal: todos los párrafos; los de otro estilo ganan por especificidad ([data-style]).
  if (style.id === NORMAL_STYLE_ID) return `${scope} p`
  return `${scope} p[data-style='${style.id}']`
}

/** Propiedades -> declaraciones CSS. `paragraph` añade las que solo tienen sentido en un bloque. */
export function styleDeclarations(props: StyleProps, paragraph: boolean): string[] {
  const css: string[] = []
  if (props.fontFamily) css.push(`font-family: ${props.fontFamily}`)
  if (props.fontSize) css.push(`font-size: ${props.fontSize}pt`)
  if (props.color) css.push(`color: ${props.color}`)
  if (props.bold !== undefined) css.push(`font-weight: ${props.bold ? 700 : 400}`)
  if (props.italic !== undefined) css.push(`font-style: ${props.italic ? 'italic' : 'normal'}`)
  if (props.underline) css.push('text-decoration: underline')
  if (!paragraph) return css
  if (props.align) css.push(`text-align: ${props.align}`)
  if (props.lineHeight) css.push(`line-height: ${props.lineHeight}`)
  css.push(`margin-top: ${props.spaceBefore ?? 0}pt`, `margin-bottom: ${props.spaceAfter ?? 0}pt`)
  css.push(`margin-left: ${props.indentLeft ?? 0}cm`, `margin-right: ${props.indentRight ?? 0}cm`)
  if (props.firstLine) css.push(`text-indent: ${props.firstLine}cm`)
  return css
}

/**
 * Hoja de estilos del documento. Normal se aplica también al contenedor, así listas y tablas
 * heredan su letra. Con `numberedHeadings`, los títulos llevan numeración multinivel (1, 1.1,
 * 1.1.1) con contadores de CSS: no se guarda ningún número en el texto.
 */
export function stylesCss(styles: WriterStyle[], numberedHeadings = false): string {
  const rules: string[] = []
  const normal = resolveStyle(styles, NORMAL_STYLE_ID)
  rules.push(
    `.writer-content { ${styleDeclarations(normal, false).join('; ')}; line-height: ${normal.lineHeight ?? 1.3} }`
  )
  for (const style of styles) {
    const resolved = resolveStyle(styles, style.id)
    // La letra de Normal ya la hereda todo del contenedor; repetirla en cada <p> pisaría lo que
    // pone el navegador dentro de tablas (la negrita de los encabezados) o de otros bloques.
    const props = style.id === NORMAL_STYLE_ID ? paragraphOnly(resolved) : resolved
    const declarations = styleDeclarations(props, style.type === 'paragraph')
    if (declarations.length > 0) rules.push(`${styleSelector(style)} { ${declarations.join('; ')} }`)
  }
  if (numberedHeadings) rules.push(headingNumberingCss())
  return rules.join('\n')
}

function paragraphOnly(props: StyleProps): StyleProps {
  const {
    fontFamily: _font,
    fontSize: _size,
    color: _color,
    bold: _bold,
    italic: _italic,
    underline: _underline,
    ...rest
  } = props
  return rest
}

function headingNumberingCss(): string {
  const rules = ['.writer-content { counter-reset: h1 h2 h3 h4 h5 h6 }']
  for (const level of HEADING_LEVELS) {
    const deeper = HEADING_LEVELS.filter((other) => other > level).map((other) => `h${other}`)
    const reset = deeper.length > 0 ? `; counter-reset: ${deeper.join(' ')}` : ''
    rules.push(`.writer-content h${level} { counter-increment: h${level}${reset} }`)
    const number = HEADING_LEVELS.filter((other) => other <= level)
      .map((other) => `counter(h${other})`)
      .join(' "." ')
    rules.push(`.writer-content h${level}::before { content: ${number} ".\\00a0\\00a0" }`)
  }
  return rules.join('\n')
}

/** Estilo en línea para la vista previa de la galería ("AaBbCc" con el aspecto del estilo). */
export function previewCss(styles: WriterStyle[], id: string): Record<string, string> {
  const props = resolveStyle(styles, id)
  const preview: Record<string, string> = {}
  if (props.fontFamily) preview.fontFamily = props.fontFamily
  // La galería es pequeña: el tamaño se limita para que "Título" no se salga de la tarjeta.
  if (props.fontSize) preview.fontSize = `${Math.min(18, Math.max(10, props.fontSize))}pt`
  if (props.color) preview.color = props.color
  if (props.bold) preview.fontWeight = '700'
  if (props.italic) preview.fontStyle = 'italic'
  if (props.underline) preview.textDecoration = 'underline'
  return preview
}

/** Id nuevo para un estilo personalizado, legible y único: "custom-mi-estilo", "custom-mi-estilo-2"… */
export function customStyleId(name: string, styles: WriterStyle[]): string {
  const slug =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'estilo'
  const base = `custom-${slug}`
  let id = base
  for (let suffix = 2; findStyle(styles, id); suffix++) id = `${base}-${suffix}`
  return id
}

/** Cambia (o añade) un estilo sin tocar los demás. */
export function upsertStyle(styles: WriterStyle[], style: WriterStyle): WriterStyle[] {
  return findStyle(styles, style.id)
    ? styles.map((current) => (current.id === style.id ? style : current))
    : [...styles, style]
}

/**
 * Borra un estilo personalizado. Los que estaban basados en él pasan a heredar de su padre (la
 * cadena no se rompe) y conservan su aspecto añadiendo lo que heredaban.
 */
export function removeStyle(styles: WriterStyle[], id: string): WriterStyle[] {
  const removed = findStyle(styles, id)
  if (!removed || isBuiltInStyle(id)) return styles
  return styles
    .filter((style) => style.id !== id)
    .map((style) =>
      style.basedOn === id ? { ...style, basedOn: removed.basedOn, props: { ...removed.props, ...style.props } } : style
    )
}

/** ¿Es la lista de siempre? Entonces no hace falta guardarla en el archivo. */
export function isDefaultStyles(styles: WriterStyle[]): boolean {
  return canonicalJson(styles) === canonicalJson(DEFAULT_STYLES)
}

/** JSON con las claves ordenadas: dos objetos iguales dan el mismo texto aunque se crearan en otro orden. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) =>
    current && typeof current === 'object' && !Array.isArray(current)
      ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)))
      : current
  )
}

/**
 * Valida la lista de un archivo: descarta lo que no tiene forma de estilo, limpia propiedades raras
 * y añade los estilos integrados que falten (un archivo editado a mano no puede dejar el documento
 * sin Normal ni Títulos).
 */
export function normalizeStyles(raw: unknown): WriterStyle[] | null {
  if (!Array.isArray(raw)) return null
  const styles: WriterStyle[] = []
  for (const candidate of raw as Partial<WriterStyle>[]) {
    if (!candidate || typeof candidate.id !== 'string' || !/^[a-z0-9-]+$/.test(candidate.id)) continue
    if (typeof candidate.name !== 'string' || styles.some((style) => style.id === candidate.id)) continue
    const type: StyleType = candidate.type === 'character' ? 'character' : 'paragraph'
    const style: WriterStyle = { id: candidate.id, name: candidate.name, type, props: cleanProps(candidate.props) }
    if (typeof candidate.basedOn === 'string') style.basedOn = candidate.basedOn
    if (typeof candidate.next === 'string') style.next = candidate.next
    if (candidate.quick === true) style.quick = true
    styles.push(style)
  }
  if (styles.length === 0) return null
  // Los integrados primero, en su orden; detrás los personalizados.
  const builtIns = DEFAULT_STYLES.map((builtIn) => styles.find((style) => style.id === builtIn.id) ?? builtIn)
  const custom = styles.filter((style) => !isBuiltInStyle(style.id))
  return [...builtIns, ...custom]
}

const NUMBER_PROPS = [
  'fontSize',
  'spaceBefore',
  'spaceAfter',
  'lineHeight',
  'indentLeft',
  'indentRight',
  'firstLine',
  'outlineLevel'
] as const
const BOOLEAN_PROPS = ['bold', 'italic', 'underline'] as const

function cleanProps(raw: unknown): StyleProps {
  const source = (raw ?? {}) as Record<string, unknown>
  const props: StyleProps = {}
  if (typeof source.fontFamily === 'string' && source.fontFamily.trim()) props.fontFamily = source.fontFamily
  if (typeof source.color === 'string' && /^#[0-9a-f]{6}$/i.test(source.color)) props.color = source.color.toLowerCase()
  if (source.align === 'left' || source.align === 'center' || source.align === 'right' || source.align === 'justify') {
    props.align = source.align
  }
  for (const key of NUMBER_PROPS) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) props[key] = value
  }
  for (const key of BOOLEAN_PROPS) {
    if (typeof source[key] === 'boolean') props[key] = source[key] as boolean
  }
  return props
}
