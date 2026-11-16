/**
 * Citas y bibliografía (fase 17). Las fuentes se guardan en el documento (como en Word, que las
 * guarda en el .docx) y cada cita es un nodo en línea que solo dice qué fuente cita y qué páginas.
 * El texto de la cita y la bibliografía se escriben aquí, con funciones puras: APA 7 e ISO 690
 * (sistema autor-fecha) hechos a mano, sin CSL. Dos estilos bien hechos y probados valen más que
 * veinte a medias.
 *
 * El texto lleva trozos en cursiva (títulos de libros, revistas): por eso una entrada es una lista
 * de trozos `{ text, italic }` y no una cadena con HTML dentro.
 */

export const CITATION = 'citation'
export const BIBLIOGRAPHY = 'bibliography'

export type SourceType = 'book' | 'bookSection' | 'journalArticle' | 'website' | 'report' | 'other'

export const SOURCE_TYPES: { type: SourceType; label: string }[] = [
  { type: 'book', label: 'Libro' },
  { type: 'bookSection', label: 'Capítulo de libro' },
  { type: 'journalArticle', label: 'Artículo de revista' },
  { type: 'website', label: 'Sitio web' },
  { type: 'report', label: 'Informe o tesis' },
  { type: 'other', label: 'Otro' }
]

export interface Person {
  family: string
  given?: string
}

export interface Source {
  /** Etiqueta con la que la citan las citas ("Gar20"); única en el documento. */
  id: string
  type: SourceType
  authors: Person[]
  /** Organización autora ("Organización Mundial de la Salud"), en vez de personas. */
  corporateAuthor?: string
  title: string
  year?: string
  publisher?: string
  city?: string
  edition?: string
  /** Revista (artículo), libro que contiene el capítulo o nombre del sitio web. */
  container?: string
  editors?: Person[]
  volume?: string
  issue?: string
  pages?: string
  /** Tipo de informe ("Tesis doctoral", "Informe técnico") o institución de una tesis. */
  reportType?: string
  url?: string
  doi?: string
  /** Fecha de consulta de una web, ISO (2026-03-05). */
  accessed?: string
}

export type CitationStyle = 'apa' | 'iso690'

export const CITATION_STYLES: { style: CitationStyle; label: string; description: string }[] = [
  { style: 'apa', label: 'APA 7.ª edición', description: '(García, 2020, p. 5)' },
  { style: 'iso690', label: 'ISO 690 (autor y fecha)', description: '(GARCÍA, 2020, p. 5)' }
]

export const DEFAULT_CITATION_STYLE: CitationStyle = 'apa'
export const isCitationStyle = (value: unknown): value is CitationStyle => value === 'apa' || value === 'iso690'

/** Un trozo de texto de una cita o de una entrada de la bibliografía. */
export interface TextPiece {
  text: string
  italic?: boolean
}

export const piecesText = (pieces: readonly TextPiece[]) => pieces.map((piece) => piece.text).join('')

// --- Nombres ---

/** Iniciales de un nombre de pila: "Ana María" -> "A. M."; "José-Luis" -> "J.-L." */
export function initials(given: string): string {
  return given
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split('-')
        .map((piece) => `${[...piece][0]?.toUpperCase() ?? ''}.`)
        .join('-')
    )
    .join(' ')
}

/** Apellido para citar: el de la persona o el nombre de la organización. */
function citedNames(source: Source): string[] {
  if (source.authors.length > 0) return source.authors.map((author) => author.family)
  if (source.corporateAuthor) return [source.corporateAuthor]
  return []
}

/** Lista con "y" antes del último: "A, B y C". */
function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}

const NO_DATE: Record<CitationStyle, string> = { apa: 's. f.', iso690: 's. f.' }

// --- Desambiguación: García 2020a, García 2020b ---

/** Clave de autor y año: dos fuentes con la misma necesitan una letra detrás del año. */
const authorYearKey = (source: Source) => `${citedNames(source).join('|').toLowerCase()}#${source.year ?? ''}`

/**
 * Letra de cada fuente que comparte autores y año con otra ("a", "b"...), en el orden de la
 * bibliografía (por título). Las demás no llevan letra.
 */
export function yearSuffixes(sources: readonly Source[]): Map<string, string> {
  const groups = new Map<string, Source[]>()
  for (const source of sources) {
    const key = authorYearKey(source)
    groups.set(key, [...(groups.get(key) ?? []), source])
  }
  const suffixes = new Map<string, string>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    ;[...group]
      .sort((a, b) => compareText(a.title, b.title))
      .forEach((source, index) => suffixes.set(source.id, String.fromCharCode(97 + (index % 26))))
  }
  return suffixes
}

const yearOf = (source: Source, style: CitationStyle, suffixes: Map<string, string>) =>
  `${source.year?.trim() || NO_DATE[style]}${source.year?.trim() ? (suffixes.get(source.id) ?? '') : ''}`

// --- Citas en el texto ---

export interface CitationOptions {
  /** Páginas citadas: "45" o "45-47". */
  pages?: string
}

/** "p. 5" o "pp. 5-7" (con guion corto entre las dos). */
export function pagesText(pages: string): string {
  const clean = pages.trim().replace(/\s*[-–—]+\s*/g, '–')
  return `${/[–,]/.test(clean) ? 'pp.' : 'p.'} ${clean}`
}

/**
 * Cita en el texto, con paréntesis. APA 7: un autor (García, 2020), dos (García y Pérez, 2020),
 * tres o más (García et al., 2020). ISO 690 autor-fecha: apellidos en versalitas que aquí son
 * mayúsculas, (GARCÍA, 2020); de cuatro autores en adelante, el primero con "et al.".
 */
export function formatCitation(
  source: Source | undefined,
  style: CitationStyle,
  options: CitationOptions = {},
  allSources: readonly Source[] = source ? [source] : []
): string {
  if (!source) return '(Fuente no encontrada)'
  const names = citedNames(source)
  const suffixes = yearSuffixes(allSources)
  let who: string
  if (style === 'apa') {
    who = names.length >= 3 ? `${names[0]} et al.` : joinWithAnd(names)
  } else {
    const upper = names.map((name) => name.toLocaleUpperCase('es'))
    who = upper.length >= 4 ? `${upper[0]} et al.` : joinWithAnd(upper)
  }
  if (!who) who = shortTitle(source.title)
  const pieces = [who, yearOf(source, style, suffixes)]
  if (options.pages?.trim()) pieces.push(pagesText(options.pages))
  return `(${pieces.join(', ')})`
}

/** Sin autor, se cita por el título (las primeras palabras, entre comillas en APA). */
function shortTitle(title: string): string {
  const words = title.trim().split(/\s+/)
  return `«${words.slice(0, 4).join(' ')}${words.length > 4 ? '…' : ''}»`
}

// --- Bibliografía ---

/** Orden de la bibliografía: por el primer apellido (o el título), luego el año y el título. */
export function sortSources(sources: readonly Source[]): Source[] {
  const key = (source: Source) => (citedNames(source)[0] ?? source.title).toLocaleLowerCase('es')
  return [...sources].sort(
    (a, b) => compareText(key(a), key(b)) || compareText(a.year ?? '', b.year ?? '') || compareText(a.title, b.title)
  )
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
const compareText = (a: string, b: string) => collator.compare(a, b)

export interface BibliographyEntry {
  id: string
  pieces: TextPiece[]
}

/** La bibliografía entera, ordenada, en el estilo del documento. */
export function formatBibliography(sources: readonly Source[], style: CitationStyle): BibliographyEntry[] {
  const suffixes = yearSuffixes(sources)
  return sortSources(sources).map((source) => ({
    id: source.id,
    pieces: style === 'apa' ? apaEntry(source, suffixes) : isoEntry(source, suffixes)
  }))
}

/** Une trozos y quita los vacíos. */
const piece = (text: string | undefined, italic = false): TextPiece[] =>
  text ? [{ text, ...(italic && { italic }) }] : []
const ensurePeriod = (text: string) => (/[.?!]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`)

/** "2" -> "2.ª ed."; lo que ya traiga "ed" se deja. */
function editionText(edition: string | undefined): string | undefined {
  const value = edition?.trim()
  if (!value || value === '1') return undefined
  if (/ed/i.test(value)) return value
  return /^\d+$/.test(value) ? `${value}.ª ed.` : `${value} ed.`
}

const doiUrl = (doi: string) => (/^https?:\/\//.test(doi) ? doi : `https://doi.org/${doi.replace(/^doi:\s*/i, '')}`)

// APA 7 ---------------------------------------------------------------------

/** "García, A. B., Pérez, L. y López, M." (en español, "y" en lugar de "&"). */
function apaAuthors(source: Source): string {
  if (source.authors.length === 0) return source.corporateAuthor ?? ''
  const names = source.authors.map((author) =>
    author.given ? `${author.family}, ${initials(author.given)}` : author.family
  )
  // APA 7: hasta 20 autores; de 21 en adelante, los 19 primeros, "..." y el último.
  const shown = names.length > 20 ? [...names.slice(0, 19), '…', names.at(-1)!] : names
  if (shown.length === 1) return shown[0]
  return `${shown.slice(0, -1).join(', ')} y ${shown.at(-1)}`
}

/** "A. García y L. Pérez (Eds.)" */
function apaEditors(editors: readonly Person[]): string {
  const names = editors.map((editor) => (editor.given ? `${initials(editor.given)} ${editor.family}` : editor.family))
  return `${joinWithAnd(names)} (${editors.length > 1 ? 'Eds.' : 'Ed.'})`
}

function apaEntry(source: Source, suffixes: Map<string, string>): TextPiece[] {
  return apaPieces(source, suffixes)
    .filter((entry) => entry.text !== '')
    .map(trimLast)
}

function apaPieces(source: Source, suffixes: Map<string, string>): TextPiece[] {
  const authors = apaAuthors(source)
  const date = `(${yearOf(source, 'apa', suffixes)}).`
  const link = source.doi ? doiUrl(source.doi) : source.url
  // Sin autor, el título pasa al principio (APA 7.08).
  const lead: TextPiece[] = authors ? [{ text: `${ensurePeriod(authors)} ${date} ` }] : []
  const tail = (pieces: TextPiece[]) => (authors ? [...lead, ...pieces] : [...titleFirst(pieces, date)])
  const edition = editionText(source.edition)
  switch (source.type) {
    case 'journalArticle': {
      const volume = source.volume?.trim()
      return tail([
        { text: `${ensurePeriod(source.title)} ` },
        ...piece(source.container, true),
        ...(volume ? [{ text: ', ' }, { text: volume, italic: true }] : []),
        ...piece(source.issue?.trim() ? `(${source.issue.trim()})` : undefined),
        ...piece(source.pages?.trim() ? `, ${source.pages.trim().replace(/\s*[-–]+\s*/g, '–')}` : undefined),
        { text: '.' },
        ...piece(link && ` ${link}`)
      ])
    }
    case 'bookSection':
      return tail([
        { text: `${ensurePeriod(source.title)} En ` },
        ...piece(source.editors?.length ? `${apaEditors(source.editors)}, ` : undefined),
        ...piece(source.container, true),
        ...piece(source.pages?.trim() ? ` (${pagesText(source.pages)})` : undefined),
        { text: '. ' },
        ...piece(source.publisher && ensurePeriod(source.publisher)),
        ...piece(link && ` ${link}`)
      ])
    case 'website':
      return tail([
        { text: source.title.trim(), italic: true },
        { text: '. ' },
        ...piece(source.container && source.container !== authors ? `${ensurePeriod(source.container)} ` : undefined),
        ...piece(link)
      ])
    case 'report':
      return tail([
        { text: source.title.trim(), italic: true },
        ...piece(source.reportType && ` [${source.reportType.trim()}]`),
        { text: '. ' },
        ...piece(source.publisher && `${ensurePeriod(source.publisher)} `),
        ...piece(link)
      ])
    default:
      return tail([
        { text: source.title.trim(), italic: true },
        ...piece(edition && ` (${edition})`),
        { text: '. ' },
        ...piece(source.publisher && `${ensurePeriod(source.publisher)} `),
        ...piece(link)
      ])
  }
}

/** Sin autor: "Título. (2020). Resto." — el título va donde iría el autor. */
function titleFirst(pieces: TextPiece[], date: string): TextPiece[] {
  // El primer trozo es el título (con su punto); detrás va la fecha.
  const [title, ...rest] = pieces
  const titleText = title.text.trim().replace(/\.$/, '')
  const separator = rest[0]?.text === '. ' ? rest.slice(1) : rest
  return [{ ...title, text: `${titleText}.` }, { text: ` ${date} ` }, ...separator]
}

const trimLast = (pieceValue: TextPiece, index: number, all: TextPiece[]) =>
  index === all.length - 1 ? { ...pieceValue, text: pieceValue.text.trimEnd() } : pieceValue

// ISO 690 (autor-fecha) -------------------------------------------------------

/** "GARCÍA LÓPEZ, Ana, PÉREZ, Luis y LÓPEZ, María"; de cuatro en adelante, el primero y "et al.". */
function isoAuthors(source: Source): string {
  if (source.authors.length === 0) return source.corporateAuthor?.toLocaleUpperCase('es') ?? ''
  const names = source.authors.map((author) =>
    author.given ? `${author.family.toLocaleUpperCase('es')}, ${author.given}` : author.family.toLocaleUpperCase('es')
  )
  return names.length >= 4 ? `${names[0]} et al.` : joinWithAnd(names)
}

function isoEntry(source: Source, suffixes: Map<string, string>): TextPiece[] {
  return isoPieces(source, suffixes)
    .filter((entry) => entry.text !== '')
    .map(trimLast)
}

function isoPieces(source: Source, suffixes: Map<string, string>): TextPiece[] {
  const authors = isoAuthors(source)
  const year = yearOf(source, 'iso690', suffixes)
  const lead: TextPiece[] = [{ text: authors ? `${authors}, ${year}. ` : '' }]
  const place = [source.city?.trim(), source.publisher?.trim()].filter(Boolean).join(': ')
  const edition = editionText(source.edition)
  const link = source.doi ? `DOI ${source.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}.` : undefined
  const online = source.url
    ? [
        ...(source.accessed ? [{ text: ` [consulta: ${accessedText(source.accessed)}].` }] : []),
        { text: ` Disponible en: ${source.url}` }
      ]
    : []
  // Sin autor, la entrada empieza por el título y el año va detrás.
  const titleLead = (title: TextPiece[]): TextPiece[] =>
    authors ? [...lead, ...title] : [...title, { text: ` ${year}.` }]
  switch (source.type) {
    case 'journalArticle':
      return [
        ...titleLead([{ text: ensurePeriod(source.title) }]),
        { text: ' ' },
        ...piece(source.container, true),
        ...piece(source.url ? ' [en línea]' : undefined),
        { text: '.' },
        ...piece(source.volume?.trim() && ` Vol. ${source.volume.trim()}`),
        ...piece(source.issue?.trim() && `${source.volume?.trim() ? ',' : ''} n.º ${source.issue.trim()}`),
        ...piece(source.pages?.trim() && `, ${pagesText(source.pages)}`),
        ...piece(source.volume || source.issue || source.pages ? '.' : undefined),
        ...piece(link && ` ${link}`),
        ...online
      ]
    case 'bookSection':
      return [
        ...titleLead([{ text: ensurePeriod(source.title) }]),
        { text: ' En: ' },
        ...piece(
          source.editors?.length
            ? `${source.editors.map((editor) => editor.family.toLocaleUpperCase('es')).join(', ')} (ed.). `
            : undefined
        ),
        ...piece(source.container, true),
        { text: '.' },
        ...piece(place && ` ${place}.`),
        ...piece(source.pages?.trim() && ` ${pagesText(source.pages)}.`),
        ...piece(link && ` ${link}`)
      ]
    case 'website':
      return [
        ...titleLead([{ text: source.title.trim(), italic: true }]),
        { text: ' [en línea].' },
        ...piece(source.container && ` ${ensurePeriod(source.container)}`),
        ...online
      ]
    default:
      return [
        ...titleLead([{ text: source.title.trim(), italic: true }]),
        ...piece(source.url ? ' [en línea]' : undefined),
        { text: '.' },
        ...piece(source.type === 'report' && source.reportType ? ` ${ensurePeriod(source.reportType)}` : undefined),
        ...piece(edition && ` ${edition}`),
        ...piece(place && ` ${place}.`),
        ...piece(link && ` ${link}`),
        ...online
      ]
  }
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]

/** "2026-03-05" -> "5 marzo 2026" (lo que no sea una fecha ISO se deja tal cual). */
function accessedText(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return value.trim()
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`
}

// --- Etiquetas y validación ---

/**
 * Etiqueta propuesta para una fuente nueva, como Word: tres letras del apellido y dos del año
 * ("García", 2020 -> "Gar20"). Si ya existe, con una letra detrás ("Gar20a").
 */
export function suggestSourceId(
  source: Pick<Source, 'authors' | 'corporateAuthor' | 'title' | 'year'>,
  existing: readonly string[]
): string {
  const name = source.authors[0]?.family || source.corporateAuthor || source.title || 'Fuente'
  const letters = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
  const base = `${letters || 'Fue'}${(source.year ?? '').replace(/\D/g, '').slice(-2)}`
  if (!existing.includes(base)) return base
  for (let index = 0; ; index++) {
    const candidate = `${base}${String.fromCharCode(97 + (index % 26))}${index >= 26 ? Math.floor(index / 26) : ''}`
    if (!existing.includes(candidate)) return candidate
  }
}

/** "García López, Ana; Pérez, Luis" -> personas (lo que escribe el cuadro de fuentes). */
export function parsePeople(text: string): Person[] {
  return text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [family, ...given] = part.split(',')
      const person: Person = { family: family.trim() }
      const givenName = given.join(',').trim()
      if (givenName) person.given = givenName
      return person
    })
}

export const peopleText = (people: readonly Person[] | undefined) =>
  (people ?? []).map((person) => (person.given ? `${person.family}, ${person.given}` : person.family)).join('; ')

const OPTIONAL_TEXT = [
  'corporateAuthor',
  'year',
  'publisher',
  'city',
  'edition',
  'container',
  'volume',
  'issue',
  'pages',
  'reportType',
  'url',
  'doi',
  'accessed'
] as const

/** Fuentes guardadas en el archivo: se valida cada una; las que no tienen forma se descartan. */
export function normalizeSources(raw: unknown): Source[] {
  if (!Array.isArray(raw)) return []
  const sources: Source[] = []
  for (const candidate of raw as Partial<Source>[]) {
    if (!candidate || typeof candidate.id !== 'string' || !candidate.id.trim()) continue
    if (sources.some((source) => source.id === candidate.id)) continue
    const type = SOURCE_TYPES.some((entry) => entry.type === candidate.type) ? (candidate.type as SourceType) : 'other'
    const source: Source = {
      id: candidate.id,
      type,
      authors: normalizePeople(candidate.authors),
      title: typeof candidate.title === 'string' ? candidate.title : ''
    }
    for (const key of OPTIONAL_TEXT) {
      const value = candidate[key]
      if (typeof value === 'string' && value.trim()) source[key] = value
      else if (typeof value === 'number') source[key] = String(value)
    }
    const editors = normalizePeople(candidate.editors)
    if (editors.length > 0) source.editors = editors
    sources.push(source)
  }
  return sources
}

function normalizePeople(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((person: Partial<Person> | null) =>
    person && typeof person.family === 'string' && person.family.trim()
      ? [
          {
            family: person.family.trim(),
            ...(typeof person.given === 'string' && person.given.trim() && { given: person.given.trim() })
          }
        ]
      : []
  )
}
