/**
 * "Cambiar mayúsculas y minúsculas" de la pestaña Inicio. Funciones puras, con `es-ES` para que
 * los acentos y la ñ se conviertan bien (y para que la i turca no dé sorpresas).
 */

export type CaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle'

export const CASE_MODES: { id: CaseMode; label: string }[] = [
  { id: 'sentence', label: 'Tipo oración.' },
  { id: 'lower', label: 'minúsculas' },
  { id: 'upper', label: 'MAYÚSCULAS' },
  { id: 'title', label: 'Poner En Mayúsculas Cada Palabra' },
  { id: 'toggle', label: 'tIPO iNVERSO' }
]

const LOCALE = 'es-ES'
const upper = (text: string) => text.toLocaleUpperCase(LOCALE)
const lower = (text: string) => text.toLocaleLowerCase(LOCALE)
/** Letras de cualquier alfabeto (incluidas á, ü, ñ). */
const LETTER = /\p{L}/u

/**
 * Convierte el texto. `startsSentence` dice si el texto empieza una frase (para "Tipo oración"
 * aplicado a un trozo a mitad de frase).
 */
export function changeCase(text: string, mode: CaseMode, startsSentence = true): string {
  switch (mode) {
    case 'lower':
      return lower(text)
    case 'upper':
      return upper(text)
    case 'toggle':
      return [...text].map((char) => (char === upper(char) ? lower(char) : upper(char))).join('')
    case 'title':
      // Una palabra empieza tras algo que no es letra ni apóstrofo: "o'neill" no pasa a "O'Neill".
      return lower(text).replace(
        /(^|[^\p{L}'’])(\p{L})/gu,
        (_, before: string, letter: string) => before + upper(letter)
      )
    case 'sentence': {
      let capitalizeNext = startsSentence
      let result = ''
      for (const char of lower(text)) {
        if (capitalizeNext && LETTER.test(char)) {
          result += upper(char)
          capitalizeNext = false
        } else {
          result += char
          if (/[.!?¡¿\n]/.test(char)) capitalizeNext = true
        }
      }
      return result
    }
  }
}

/** Ordena párrafos por su texto como lo haría una persona: sin importar acentos y con los números en orden. */
export function compareTexts(a: string, b: string): number {
  return a.localeCompare(b, LOCALE, { sensitivity: 'base', numeric: true })
}
