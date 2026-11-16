/**
 * Campos (fase 16): trozos de texto que el documento calcula en vez de guardarlos fijos, como los
 * de Word. El archivo guarda solo el tipo; el valor se pinta cada vez (la fecha de hoy, la hoja
 * donde cae, cuántas hojas hay...).
 */

export const FIELD = 'field'

export type FieldKind = 'date' | 'page' | 'pages' | 'fileName' | 'author'

export const FIELD_KINDS: { kind: FieldKind; label: string; description: string }[] = [
  { kind: 'date', label: 'Fecha', description: 'La fecha de hoy; cambia cada día que abres el documento' },
  { kind: 'page', label: 'Número de página', description: 'La hoja donde está el campo' },
  { kind: 'pages', label: 'Número de páginas', description: 'Cuántas hojas tiene el documento' },
  { kind: 'fileName', label: 'Nombre del archivo', description: 'El nombre con el que está guardado' },
  { kind: 'author', label: 'Autor', description: 'El autor del documento (Archivo > Propiedades en Word)' }
]

export const isFieldKind = (value: unknown): value is FieldKind => FIELD_KINDS.some((field) => field.kind === value)

/** Lo que hace falta para calcular cualquier campo. */
export interface FieldContext {
  date: Date
  page: number
  pages: number
  fileName: string
  author: string
}

/** Fecha larga en español ("16 de noviembre de 2026"), la misma que el botón Fecha. */
export const longDate = (date = new Date()) =>
  date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

/** Texto que pinta un campo. Si falta el dato (sin autor), un aviso entre corchetes, como Word. */
export function fieldText(kind: FieldKind, context: FieldContext): string {
  switch (kind) {
    case 'date':
      return longDate(context.date)
    case 'page':
      return String(context.page)
    case 'pages':
      return String(context.pages)
    case 'fileName':
      return context.fileName || '[Sin guardar]'
    case 'author':
      return context.author || '[Autor]'
  }
}

/**
 * Instrucción del campo en Word (`w:fldSimple w:instr`). La fecha lleva el formato largo en
 * español: Word la escribe con el idioma del documento.
 */
export function docxFieldInstruction(kind: FieldKind): string {
  switch (kind) {
    case 'date':
      return `DATE \\@ "d 'de' MMMM 'de' yyyy"`
    case 'page':
      return 'PAGE'
    case 'pages':
      return 'NUMPAGES'
    case 'fileName':
      return 'FILENAME'
    case 'author':
      return 'AUTHOR'
  }
}
