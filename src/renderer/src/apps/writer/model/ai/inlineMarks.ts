import type { JSONContent } from '@tiptap/core'

/**
 * Conservar el formato al reescribir con IA.
 *
 * El modelo solo entiende texto, pero un texto con negritas no es "texto plano". La idea: mandar
 * el formato como marcas ligeras al estilo Markdown, que los modelos conocen de sobra y cuestan
 * pocos tokens, y al volver reconstruir los *marks* de Tiptap.
 *
 *   **negrita**   *cursiva*   ~~tachado~~   <u>subrayado</u>   `código`
 *
 * El formato que no tiene marca (color, fuente, resaltado, enlaces) no se le manda al modelo:
 * si toda la selección lo comparte se vuelve a aplicar al resultado entero ("marcas comunes");
 * si solo lo tenía una parte, se pierde (el panel lo avisa).
 */
type Mark = NonNullable<JSONContent['marks']>[number]

interface Delimiter {
  mark: string
  open: string
  close: string
}

/** El orden importa: "**" antes que "*" para no confundir negrita con dos cursivas. */
const DELIMITERS: Delimiter[] = [
  { mark: 'bold', open: '**', close: '**' },
  { mark: 'strike', open: '~~', close: '~~' },
  { mark: 'underline', open: '<u>', close: '</u>' },
  { mark: 'code', open: '`', close: '`' },
  { mark: 'italic', open: '*', close: '*' }
]

const MARKED_TYPES = new Set(DELIMITERS.map((delimiter) => delimiter.mark))
/** Orden de anidamiento al escribir: siempre el mismo, para que la ida y vuelta sea estable. */
const WRITE_ORDER = ['bold', 'italic', 'strike', 'underline', 'code']

/** Nodos de una línea (párrafo o título) -> texto con marcas. */
export function inlineToMarked(nodes: JSONContent[] | undefined): string {
  let text = ''
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      text += ' '
      continue
    }
    if (node.type !== 'text' || !node.text) continue
    const marks = WRITE_ORDER.filter((name) => node.marks?.some((mark) => mark.type === name))
    // Los espacios de los bordes van fuera de las marcas: "** hola**" no es negrita en Markdown.
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text)!
    if (!core) {
      text += node.text
      continue
    }
    const opening = marks.map((name) => delimiterFor(name).open).join('')
    const closing = [...marks]
      .reverse()
      .map((name) => delimiterFor(name).close)
      .join('')
    text += `${lead}${opening}${core}${closing}${trail}`
  }
  return mergeAdjacentDelimiters(text)
}

/** "**a****b**" -> "**ab**": dos nodos seguidos con la misma marca se escriben como uno. */
function mergeAdjacentDelimiters(text: string): string {
  return text.replace(/\*\*\*\*|~~~~|<\/u><u>/g, '')
}

function delimiterFor(mark: string): Delimiter {
  return DELIMITERS.find((delimiter) => delimiter.mark === mark)!
}

/** Contenido de una selección (slice de ProseMirror en JSON) -> párrafos con marcas, separados por línea en blanco. */
export function blocksToMarked(content: JSONContent[]): string {
  const blocks: string[] = []
  const visit = (node: JSONContent) => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      const text = inlineToMarked(node.content).trim()
      if (text) blocks.push(text)
      return
    }
    if (node.type === 'text' || node.type === 'hardBreak') {
      // Selección dentro de un solo párrafo: el slice trae directamente los nodos de texto.
      blocks.push(inlineToMarked([node]))
      return
    }
    node.content?.forEach(visit)
  }
  const inlineOnly = content.every((node) => node.type === 'text' || node.type === 'hardBreak')
  if (inlineOnly) return inlineToMarked(content).trim()
  content.forEach(visit)
  return blocks.join('\n\n')
}

/**
 * Texto con marcas -> nodos de texto de Tiptap. Un delimitador solo abre si tiene pareja más
 * adelante y va pegado al texto ("2 * 3 * 4" no es cursiva); si no, se queda como texto.
 * `baseMarks` se añaden a todos los nodos (el formato común de la selección original).
 */
export function markedToInline(text: string, baseMarks: Mark[] = []): JSONContent[] {
  const nodes: JSONContent[] = []
  const active: string[] = []
  let buffer = ''

  const flush = () => {
    if (!buffer) return
    const marks = [...baseMarks.filter((mark) => !active.includes(mark.type)), ...active.map((type) => ({ type }))]
    const previous = nodes.at(-1)
    if (previous && sameMarks(previous.marks ?? [], marks)) previous.text += buffer
    else nodes.push(marks.length ? { type: 'text', text: buffer, marks } : { type: 'text', text: buffer })
    buffer = ''
  }

  let index = 0
  while (index < text.length) {
    // Primero, ¿cierra la marca más interna? Así "***las dos***" cierra cursiva y luego negrita.
    const top = active.at(-1)
    const closing = top ? delimiterFor(top) : null
    if (closing && text.startsWith(closing.close, index) && !/\s/.test(text[index - 1] ?? ' ')) {
      flush()
      active.pop()
      index += closing.close.length
      continue
    }
    // Dentro de `código` no hay más marcas: el texto va literal hasta el cierre.
    const opening =
      top === 'code'
        ? undefined
        : DELIMITERS.find(
            (candidate) =>
              !active.includes(candidate.mark) &&
              text.startsWith(candidate.open, index) &&
              opensHere(text, index, candidate)
          )
    if (opening) {
      flush()
      active.push(opening.mark)
      index += opening.open.length
      continue
    }
    buffer += text[index]
    index++
  }
  flush()
  return nodes
}

function opensHere(text: string, index: number, delimiter: Delimiter): boolean {
  const after = text[index + delimiter.open.length]
  if (after === undefined || /\s/.test(after)) return false
  const closing = text.indexOf(delimiter.close, index + delimiter.open.length + 1)
  return closing > 0 && !/\s/.test(text[closing - 1])
}

function sameMarks(a: Mark[], b: Mark[]): boolean {
  return a.length === b.length && a.every((mark, index) => JSON.stringify(mark) === JSON.stringify(b[index]))
}

/** Sin marcas: para copiar al portapapeles o comparar con el original. */
export function markedToPlain(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) =>
      markedToInline(paragraph)
        .map((node) => node.text ?? '')
        .join('')
    )
    .join('\n\n')
}

/**
 * Marcas que no viajan como texto (color, fuente, resaltado...) y que tiene TODA la selección.
 * Esas se pueden volver a aplicar al resultado sin adivinar a qué palabras correspondían.
 */
export function commonUnmarkedMarks(content: JSONContent[]): Mark[] {
  const texts: JSONContent[] = []
  const collect = (node: JSONContent) => {
    if (node.type === 'text' && node.text?.trim()) texts.push(node)
    node.content?.forEach(collect)
  }
  content.forEach(collect)
  if (texts.length === 0) return []
  const candidates = (texts[0].marks ?? []).filter((mark) => !MARKED_TYPES.has(mark.type))
  return candidates.filter((candidate) =>
    texts.every((node) => node.marks?.some((mark) => JSON.stringify(mark) === JSON.stringify(candidate)))
  )
}

/** ¿Había formato que se va a perder (solo en parte de la selección y sin marca de texto)? */
export function hasPartialUnmarkedFormat(content: JSONContent[]): boolean {
  const common = new Set(commonUnmarkedMarks(content).map((mark) => JSON.stringify(mark)))
  let partial = false
  const visit = (node: JSONContent) => {
    for (const mark of node.marks ?? []) {
      if (!MARKED_TYPES.has(mark.type) && !common.has(JSON.stringify(mark))) partial = true
    }
    node.content?.forEach(visit)
  }
  content.forEach(visit)
  return partial
}
