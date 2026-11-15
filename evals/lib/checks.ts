import { markedToInline } from '@/apps/writer/model/ai/inlineMarks'
import type { CheckResult } from './types'

/**
 * Comprobaciones deterministas: siempre dan el mismo veredicto para la misma salida.
 * Son baratas, no necesitan otro modelo y no se equivocan, así que van primero. El juez LLM
 * (judge.ts) solo se usa para lo que no se puede medir así ("¿el resumen es fiel?").
 */

const normalize = (text: string) => text.toLocaleLowerCase('es').replace(/\s+/g, ' ').trim()

/** Cada palabra o frase debe aparecer (sin distinguir mayúsculas, pero SÍ tildes: suelen ser la corrección). */
export function containsAll(output: string, expected: string[], name = 'contiene'): CheckResult {
  const text = normalize(output)
  const missing = expected.filter((word) => !text.includes(normalize(word)))
  return { name, passed: missing.length === 0, detail: missing.length ? `falta: ${missing.join(', ')}` : undefined }
}

export function containsNone(output: string, forbidden: string[], name = 'no contiene'): CheckResult {
  const text = normalize(output)
  const found = forbidden.filter((word) => text.includes(normalize(word)))
  return { name, passed: found.length === 0, detail: found.length ? `aparece: ${found.join(', ')}` : undefined }
}

/** Distancia de edición (Levenshtein) con dos filas: O(n·m) en tiempo y O(m) en memoria. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

/** 1 = idénticos, 0 = nada que ver. Útil para "corrige sin reescribir": la salida debe parecerse a lo esperado. */
export function similarity(a: string, b: string): number {
  const left = a.replace(/\s+/g, ' ').trim()
  const right = b.replace(/\s+/g, ' ').trim()
  const longest = Math.max(left.length, right.length)
  return longest === 0 ? 1 : 1 - editDistance(left, right) / longest
}

export function similarTo(output: string, expected: string, minimum: number): CheckResult {
  const value = similarity(output, expected)
  return {
    name: `parecido a lo esperado ≥ ${minimum}`,
    passed: value >= minimum,
    detail: `similitud ${value.toFixed(2)}`
  }
}

/** "¡Claro! Aquí tienes…" acabaría pegado en el documento del usuario. */
const PREAMBLE = /^(¡?claro|¡?por supuesto|aquí (tienes|está)|este es el texto|texto corregido|sure|here is|here's)\b/i

export function noPreamble(output: string): CheckResult {
  const match = PREAMBLE.exec(output.trim())
  return { name: 'sin frase de cortesía', passed: !match, detail: match ? `empieza por «${match[0]}»` : undefined }
}

/** Proporción de longitud salida/entrada dentro de [min, max]. */
export function lengthRatio(output: string, input: string, min: number, max: number): CheckResult {
  const ratio = output.trim().length / Math.max(1, input.trim().length)
  return {
    name: `longitud entre ${min}× y ${max}× la original`,
    passed: ratio >= min && ratio <= max,
    detail: `${ratio.toFixed(2)}×`
  }
}

const STOPWORDS = {
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'es', 'por', 'con', 'para', 'del', 'se', 'no'],
  en: ['the', 'of', 'and', 'to', 'in', 'is', 'a', 'that', 'for', 'it', 'with', 'this', 'on', 'be', 'are', 'has']
} as const

export type Language = keyof typeof STOPWORDS

/** Detector de idioma de juguete (palabras vacías): basta para "¿contestó en el idioma del texto?". */
export function detectLanguage(text: string): Language {
  const words = normalize(text).split(/[^\p{L}]+/u)
  const count = (language: Language) =>
    words.filter((word) => (STOPWORDS[language] as readonly string[]).includes(word)).length
  return count('en') > count('es') ? 'en' : 'es'
}

export function inLanguage(output: string, expected: Language): CheckResult {
  const detected = detectLanguage(output)
  return {
    name: `en ${expected === 'es' ? 'español' : 'inglés'}`,
    passed: detected === expected,
    detail: `detectado: ${detected}`
  }
}

/** Una comprobación cualquiera expresada como condición. */
export function check(name: string, passed: boolean, detail?: string): CheckResult {
  return { name, passed, detail }
}

/** Palabras con cada formato (negrita, cursiva...) según las marcas de inlineMarks.ts. */
function markedWords(text: string): Map<string, string> {
  const words = new Map<string, string>()
  for (const node of markedToInline(text.replace(/\n\s*\n/g, ' '))) {
    for (const mark of node.marks ?? []) {
      words.set(mark.type, `${words.get(mark.type) ?? ''} ${node.text ?? ''}`.trim())
    }
  }
  return words
}

/** Las mismas palabras siguen con el mismo formato (para «Corregir», que no debe cambiarlas). */
export function keepsMarks(output: string, input: string): CheckResult {
  const expected = markedWords(input)
  const actual = markedWords(output)
  const problems = [...expected].filter(([mark, words]) => normalize(actual.get(mark) ?? '') !== normalize(words))
  return {
    name: 'conserva el formato',
    passed: problems.length === 0,
    detail: problems.length
      ? problems.map(([mark, words]) => `${mark}: esperaba «${words}», salió «${actual.get(mark) ?? ''}»`).join('; ')
      : undefined
  }
}

/** Al reescribir las palabras pueden cambiar: basta con que cada tipo de formato siga presente. */
export function keepsMarkTypes(output: string, input: string): CheckResult {
  const missing = [...markedWords(input).keys()].filter((mark) => !markedWords(output).has(mark))
  return {
    name: 'conserva el formato',
    passed: missing.length === 0,
    detail: missing.length ? `pierde: ${missing.join(', ')}` : undefined
  }
}
