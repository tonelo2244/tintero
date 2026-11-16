/**
 * Recuento de palabras del diálogo de Revisar > Contar palabras. Puro: recibe el texto de cada
 * párrafo (y las líneas y páginas, que solo sabe medir la pantalla) y devuelve las cifras.
 */

export interface WordCountInput {
  /** Texto de cada bloque de texto (párrafo, título, celda, elemento de lista), en orden. */
  paragraphs: string[]
  /** Líneas que ocupan en pantalla; `null` si no se han podido medir. */
  lines: number | null
  pages: number | null
}

export interface WordCount {
  pages: number | null
  words: number
  charactersNoSpaces: number
  charactersWithSpaces: number
  /** Párrafos con algo escrito: Word no cuenta los vacíos. */
  paragraphs: number
  lines: number | null
}

/**
 * Palabra = tira de caracteres sin espacios, como cuenta Word ("e-mail" y "3,5" son una). Los
 * signos sueltos ("—", "·") no cuentan: hace falta al menos una letra o un número.
 */
export function countWords(text: string): number {
  return text.split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

export function wordCount({ paragraphs, lines, pages }: WordCountInput): WordCount {
  // Los tabuladores y saltos de línea dentro del párrafo son espacios para Word.
  const texts = paragraphs.map((text) => text.replace(/[\t\n]/g, ' '))
  const written = texts.filter((text) => text.trim() !== '')
  return {
    pages,
    words: written.reduce((total, text) => total + countWords(text), 0),
    charactersNoSpaces: written.reduce((total, text) => total + [...text.replace(/\s/gu, '')].length, 0),
    charactersWithSpaces: written.reduce((total, text) => total + [...text].length, 0),
    paragraphs: written.length,
    lines
  }
}

/** "12.345" con el separador de miles español, para el diálogo. */
export const formatCount = (value: number) => value.toLocaleString('es-ES')
