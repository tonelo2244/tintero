import { suggestSourceId, type Person, type Source, type SourceType } from './citations'

/**
 * Importar fuentes desde BibTeX (fase 17, el extra de Citas). Es el formato que exportan Google
 * Académico, Zotero, Mendeley o cualquier revista, así que basta con pegar el texto.
 *
 * Un analizador pequeño y tolerante, escrito a mano: entradas `@tipo{clave, campo = {valor}, ...}`
 * con valores entre llaves (anidadas), entre comillas o números, y concatenación con `#`. Lo que
 * no entiende lo salta sin parar: una entrada rota no estropea las demás.
 */

export interface BibtexResult {
  sources: Source[]
  /** Entradas que no se pudieron leer (por su clave o su posición), para avisar. */
  skipped: string[]
}

const TYPE_MAP: Record<string, SourceType> = {
  book: 'book',
  inbook: 'bookSection',
  incollection: 'bookSection',
  inproceedings: 'bookSection',
  conference: 'bookSection',
  article: 'journalArticle',
  techreport: 'report',
  phdthesis: 'report',
  mastersthesis: 'report',
  online: 'website',
  electronic: 'website',
  www: 'website'
}

const THESIS_TYPE: Record<string, string> = {
  phdthesis: 'Tesis doctoral',
  mastersthesis: 'Trabajo de fin de máster'
}

/** Fuentes de un texto BibTeX. `existing` son las etiquetas ya usadas en el documento. */
export function parseBibtex(text: string, existing: readonly string[] = []): BibtexResult {
  const sources: Source[] = []
  const skipped: string[] = []
  const taken = [...existing]
  for (const raw of splitEntries(text)) {
    const entry = parseEntry(raw)
    if (!entry) {
      skipped.push(raw.slice(0, 40).trim())
      continue
    }
    if (['comment', 'string', 'preamble'].includes(entry.type)) continue
    const source = toSource(entry, taken)
    if (!source) {
      skipped.push(entry.key || entry.type)
      continue
    }
    taken.push(source.id)
    sources.push(source)
  }
  return { sources, skipped }
}

interface RawEntry {
  type: string
  key: string
  fields: Map<string, string>
}

/** Trozos que empiezan por @ y acaban en su llave de cierre (contando las anidadas). */
function splitEntries(text: string): string[] {
  const entries: string[] = []
  let index = text.indexOf('@')
  while (index >= 0) {
    const open = text.slice(index).search(/[{(]/)
    if (open < 0) break
    let depth = 0
    let end = index + open
    for (; end < text.length; end++) {
      const char = text[end]
      if (char === '{' || char === '(') depth++
      else if (char === '}' || char === ')') {
        depth--
        if (depth === 0) break
      }
    }
    entries.push(text.slice(index, end + 1))
    index = text.indexOf('@', end + 1)
  }
  return entries
}

function parseEntry(raw: string): RawEntry | null {
  const header = /^@\s*(\w+)\s*[{(]\s*([^,\s]*)\s*,?/.exec(raw)
  if (!header) return null
  const fields = new Map<string, string>()
  let rest = raw.slice(header[0].length, -1)
  for (;;) {
    const name = /^\s*,?\s*([A-Za-z][\w-]*)\s*=\s*/.exec(rest)
    if (!name) break
    rest = rest.slice(name[0].length)
    const value = readValue(rest)
    if (!value) break
    fields.set(name[1].toLowerCase(), cleanLatex(value.value))
    rest = rest.slice(value.length)
  }
  return { type: header[1].toLowerCase(), key: header[2], fields }
}

/** Un valor: {…}, "…" o un número/macro, con trozos unidos por #. */
function readValue(text: string): { value: string; length: number } | null {
  let index = 0
  let value = ''
  for (;;) {
    while (/\s/.test(text[index] ?? '')) index++
    const char = text[index]
    if (char === '{') {
      let depth = 0
      const start = index
      for (; index < text.length; index++) {
        if (text[index] === '{') depth++
        else if (text[index] === '}' && --depth === 0) break
      }
      value += text.slice(start + 1, index)
      index++
    } else if (char === '"') {
      const end = text.indexOf('"', index + 1)
      if (end < 0) return null
      value += text.slice(index + 1, end)
      index = end + 1
    } else {
      const bare = /^[\w.-]+/.exec(text.slice(index))
      if (!bare) return null
      value += bare[0]
      index += bare[0].length
    }
    while (/\s/.test(text[index] ?? '')) index++
    if (text[index] !== '#') break
    index++
  }
  return { value, length: index }
}

const ACCENTS: Record<string, Record<string, string>> = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', n: 'ń', c: 'ć' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' },
  '~': { n: 'ñ', N: 'Ñ', a: 'ã', o: 'õ' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û' },
  c: { c: 'ç', C: 'Ç' }
}

/** LaTeX corriente en BibTeX -> texto: acentos (\'a, {\'a}, \~n), \& y llaves de protección. */
export function cleanLatex(value: string): string {
  return value
    .replace(
      /\{?\\([`'"~^c])\s*\{?\\?([A-Za-z])\}?\}?/g,
      (match, accent: string, letter: string) => ACCENTS[accent]?.[letter] ?? match
    )
    .replace(/\\([&%$#_])/g, '$1')
    .replace(/\\(textit|emph|textbf|textsc)\{([^}]*)\}/g, '$2')
    .replace(/[{}]/g, '')
    .replace(/--/g, '–')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "García López, Ana and Luis Pérez" -> personas. "and others" es "et al." y se deja fuera. */
export function parseBibtexNames(value: string): Person[] {
  return value
    .split(/\s+and\s+/i)
    .map((name) => name.trim())
    .filter((name) => name && name.toLowerCase() !== 'others')
    .map((name) => {
      if (name.includes(',')) {
        const [family, ...given] = name.split(',')
        const givenName = given.join(',').trim()
        return { family: family.trim(), ...(givenName && { given: givenName }) }
      }
      const words = name.split(/\s+/)
      if (words.length === 1) return { family: words[0] }
      // "Ana de la Fuente": las partículas en minúscula van con el apellido.
      const particle = words.findIndex((word, index) => index > 0 && /^[a-z]/.test(word))
      const split = particle > 0 ? particle : words.length - 1
      return { family: words.slice(split).join(' '), given: words.slice(0, split).join(' ') }
    })
}

function toSource(entry: RawEntry, taken: readonly string[]): Source | null {
  const field = (name: string) => entry.fields.get(name)?.trim() || undefined
  const title = field('title')
  if (!title) return null
  const url = field('url') ?? field('howpublished')?.match(/https?:\/\/\S+/)?.[0]
  const type: SourceType =
    TYPE_MAP[entry.type] ?? (entry.type === 'misc' && url ? 'website' : entry.type === 'misc' ? 'other' : 'other')
  const authors = parseBibtexNames(field('author') ?? '')
  const year = field('year') ?? field('date')?.slice(0, 4)
  const source: Source = { id: '', type, authors, title }
  const optional: Partial<Record<keyof Source, string>> = {
    year,
    publisher: field('publisher') ?? field('school') ?? field('institution') ?? field('organization'),
    city: field('address') ?? field('location'),
    edition: field('edition'),
    container: field('journal') ?? field('journaltitle') ?? field('booktitle'),
    volume: field('volume'),
    issue: field('number') ?? field('issue'),
    pages: field('pages'),
    reportType: field('type') ?? THESIS_TYPE[entry.type],
    url,
    doi: field('doi'),
    accessed: field('urldate')
  }
  for (const [key, value] of Object.entries(optional)) {
    if (value) Object.assign(source, { [key]: value })
  }
  const editors = parseBibtexNames(field('editor') ?? '')
  if (editors.length > 0) source.editors = editors
  // La clave de BibTeX es la etiqueta, si vale y no choca; si no, una nueva como las de Word.
  const key = entry.key.replace(/[^\p{L}\p{N}_:-]/gu, '')
  source.id = key && !taken.includes(key) ? key : suggestSourceId(source, taken)
  return source
}
