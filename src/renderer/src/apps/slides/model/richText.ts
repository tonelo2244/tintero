import type { JSONContent } from '@tiptap/core'
import {
  RUN_FORMAT_KEYS,
  type HorizontalAlign,
  type RunFormat,
  type RunFormatKey,
  type TextParagraph,
  type TextRun,
  type TextStyle
} from './types'

/**
 * Texto con formato por palabra de los cuadros de texto.
 *
 * El modelo (párrafos -> trozos con formato) es nuestro y no depende de ninguna librería:
 * lo leen la vista, las miniaturas, la exportación y la importación de .pptx. Tiptap solo se usa
 * mientras se edita un cuadro; al entrar y salir se traduce con `toEditorDoc` / `fromEditorDoc`.
 */

const TOGGLE_KEYS = ['bold', 'italic', 'underline', 'strike'] as const

export function plainText(paragraphs: TextParagraph[]): string {
  return paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n')
}

export function hasText(paragraphs: TextParagraph[]): boolean {
  return paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.length > 0))
}

/** Texto plano -> párrafos sin formato propio (una línea por párrafo). */
export function paragraphsFromText(text: string): TextParagraph[] {
  if (!text) return []
  return text.split('\n').map((line) => ({ runs: line ? [{ text: line }] : [] }))
}

/** El formato propio de un trozo, sin su texto. */
export function formatOf(run: RunFormat): RunFormat {
  const format: RunFormat = {}
  for (const key of RUN_FORMAT_KEYS) {
    if (run[key] !== undefined) (format as Record<RunFormatKey, unknown>)[key] = run[key]
  }
  return format
}

function sameFormat(a: RunFormat, b: RunFormat): boolean {
  return RUN_FORMAT_KEYS.every((key) => a[key] === b[key])
}

/**
 * Forma canónica: sin trozos vacíos, trozos contiguos con el mismo formato unidos y, si no queda
 * texto, ningún párrafo. Así dos contenidos iguales siempre se guardan igual.
 */
export function normalizeParagraphs(paragraphs: TextParagraph[]): TextParagraph[] {
  if (!hasText(paragraphs)) return []
  return paragraphs.map((paragraph) => {
    const runs: TextRun[] = []
    for (const run of paragraph.runs) {
      if (!run.text) continue
      const previous = runs.at(-1)
      if (previous && sameFormat(previous, run)) runs[runs.length - 1] = { ...previous, text: previous.text + run.text }
      else runs.push({ ...run })
    }
    return withParagraphFormat({ runs }, paragraph)
  })
}

/** Copia la alineación y la viñeta propias de un párrafo (solo si las tiene). */
function withParagraphFormat(target: TextParagraph, source: Pick<TextParagraph, 'align' | 'bullets'>): TextParagraph {
  if (source.align !== undefined) target.align = source.align
  if (source.bullets !== undefined) target.bullets = source.bullets
  return target
}

/** Alineación y viñeta con las que se pinta un párrafo: las suyas o las del cuadro. */
export function resolveParagraphFormat(style: TextStyle, paragraph: TextParagraph) {
  return { align: paragraph.align ?? style.align, bullets: paragraph.bullets ?? style.bullets }
}

/** Quita a los párrafos la alineación o la viñeta propias (al aplicarlas al cuadro entero). */
export function clearParagraphFormat(paragraphs: TextParagraph[], keys: ('align' | 'bullets')[]): TextParagraph[] {
  if (keys.length === 0 || !paragraphs.some((paragraph) => keys.some((key) => key in paragraph))) return paragraphs
  return paragraphs.map((paragraph) => {
    const copy = { ...paragraph }
    for (const key of keys) delete copy[key]
    return copy
  })
}

/**
 * Quita el formato propio de unas propiedades. Se usa al dar formato al cuadro entero
 * (p. ej. negrita con el cuadro seleccionado): el cambio debe verse en todas las palabras.
 */
export function clearRunFormat(paragraphs: TextParagraph[], keys: RunFormatKey[]): TextParagraph[] {
  if (keys.length === 0) return paragraphs
  return normalizeParagraphs(
    paragraphs.map((paragraph) => ({
      ...paragraph,
      runs: paragraph.runs.map((run) => {
        const next = { ...run }
        for (const key of keys) delete next[key]
        return next
      })
    }))
  )
}

/** Formato final de un trozo: el suyo propio y, para lo que no tenga, el del cuadro. */
export function resolveRunFormat(style: TextStyle, run: RunFormat) {
  return {
    bold: run.bold ?? style.bold,
    italic: run.italic ?? style.italic,
    underline: run.underline ?? style.underline,
    strike: run.strike ?? style.strike,
    color: run.color ?? style.color,
    fontFamily: run.fontFamily ?? style.fontFamily,
    fontSize: run.fontSize ?? style.fontSize
  }
}

// ---------------------------------------------------------------------------------------------
// Traducción al documento de Tiptap (solo mientras se edita un cuadro).
//
// En Tiptap la negrita es una marca que está o no está: no existe "no negrita". Por eso las
// marcas de activar/desactivar (negrita, cursiva, subrayado, tachado) llevan el formato FINAL de
// cada trozo, y al volver se compara con el del cuadro para guardar solo lo que es distinto.
// Fuente, tamaño y color sí se pueden heredar del contenedor, así que viajan solo si son propios.
// ---------------------------------------------------------------------------------------------

const px = (size: number) => `${size}px`

export function toEditorDoc(paragraphs: TextParagraph[], style: TextStyle): JSONContent {
  const content = (paragraphs.length > 0 ? paragraphs : [{ runs: [] } as TextParagraph]).map((paragraph) => ({
    type: 'paragraph',
    // Solo lo propio del párrafo: sin atributo, el párrafo sigue al cuadro.
    ...(paragraph.align !== undefined || paragraph.bullets !== undefined
      ? { attrs: { textAlign: paragraph.align ?? null, bullet: paragraph.bullets ?? null } }
      : {}),
    content: paragraph.runs
      .filter((run) => run.text)
      .map((run) => {
        const resolved = resolveRunFormat(style, run)
        const marks: JSONContent['marks'] = TOGGLE_KEYS.filter((key) => resolved[key]).map((type) => ({ type }))
        const textStyle: Record<string, string> = {}
        if (run.color !== undefined) textStyle.color = run.color
        if (run.fontFamily !== undefined) textStyle.fontFamily = run.fontFamily
        if (run.fontSize !== undefined) textStyle.fontSize = px(run.fontSize)
        if (Object.keys(textStyle).length > 0) marks.push({ type: 'textStyle', attrs: textStyle })
        return { type: 'text', text: run.text, ...(marks.length > 0 ? { marks } : {}) }
      })
  }))
  return { type: 'doc', content }
}

export function fromEditorDoc(doc: JSONContent, style: TextStyle): TextParagraph[] {
  const paragraphs = (doc.content ?? []).map((block) => {
    const paragraph: TextParagraph = {
      runs: (block.content ?? [])
        .filter((node) => node.type === 'text' && node.text)
        .map((node) => runFromEditor(node, style))
    }
    const align = block.attrs?.textAlign as HorizontalAlign | null | undefined
    if (align && align !== style.align) paragraph.align = align
    const bullet = block.attrs?.bullet as boolean | null | undefined
    if (typeof bullet === 'boolean' && bullet !== style.bullets) paragraph.bullets = bullet
    return paragraph
  })
  return normalizeParagraphs(paragraphs)
}

function runFromEditor(node: JSONContent, style: TextStyle): TextRun {
  const marks = node.marks ?? []
  const run: TextRun = { text: node.text ?? '' }
  for (const key of TOGGLE_KEYS) {
    const active = marks.some((mark) => mark.type === key)
    if (active !== style[key]) run[key] = active
  }
  const attrs = marks.find((mark) => mark.type === 'textStyle')?.attrs ?? {}
  if (typeof attrs.color === 'string' && attrs.color && attrs.color !== style.color) run.color = attrs.color
  if (typeof attrs.fontFamily === 'string' && attrs.fontFamily && attrs.fontFamily !== style.fontFamily) {
    run.fontFamily = attrs.fontFamily
  }
  const size = parseFloat(String(attrs.fontSize ?? ''))
  if (size > 0 && size !== style.fontSize) run.fontSize = size
  return run
}
