/**
 * Ecuaciones (fase 16). Se guardan como LaTeX, que es el idioma común: KaTeX lo pinta en pantalla
 * y `docx/math` lo convierte en ecuación nativa de Word (OMML) al exportar, editable allí.
 */

export const EQUATION = 'equation'

/** Ecuaciones de ejemplo, las del menú Ecuación de Word. */
export const SAMPLE_EQUATIONS: { label: string; latex: string }[] = [
  { label: 'Fórmula cuadrática', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
  { label: 'Teorema de Pitágoras', latex: 'a^2 + b^2 = c^2' },
  { label: 'Área del círculo', latex: 'A = \\pi r^2' },
  { label: 'Teorema del binomio', latex: '(x + a)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^k a^{n-k}' },
  { label: 'Desarrollo de Taylor', latex: 'e^x = 1 + \\frac{x}{1!} + \\frac{x^2}{2!} + \\frac{x^3}{3!} + \\cdots' },
  { label: 'Integral', latex: '\\int_0^1 x^2 \\, dx = \\frac{1}{3}' }
]

/** Plantillas para escribir más deprisa: se insertan donde está el cursor del cuadro. */
export const EQUATION_SNIPPETS: { label: string; latex: string }[] = [
  { label: 'Fracción', latex: '\\frac{a}{b}' },
  { label: 'Potencia', latex: 'x^{n}' },
  { label: 'Subíndice', latex: 'x_{i}' },
  { label: 'Raíz', latex: '\\sqrt{x}' },
  { label: 'Sumatorio', latex: '\\sum_{i=1}^{n}' },
  { label: 'Integral', latex: '\\int_{a}^{b}' },
  { label: 'Límite', latex: '\\lim_{x \\to \\infty}' },
  { label: 'Matriz', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' }
]

export const DEFAULT_EQUATION = SAMPLE_EQUATIONS[0].latex

/** LaTeX limpio: sin espacios en los bordes y sin `$` o `\[ \]` si se pegó con ellos. */
export function normalizeLatex(raw: string): string {
  let latex = raw.trim()
  for (const [open, close] of [
    ['$$', '$$'],
    ['\\[', '\\]'],
    ['\\(', '\\)'],
    ['$', '$']
  ]) {
    if (latex.length > open.length + close.length && latex.startsWith(open) && latex.endsWith(close)) {
      latex = latex.slice(open.length, latex.length - close.length).trim()
      break
    }
  }
  return latex
}

/** Inserta un trozo en el texto, sustituyendo la selección [start, end). Devuelve el texto y dónde queda el cursor. */
export function insertSnippet(
  text: string,
  start: number,
  end: number,
  snippet: string
): { text: string; cursor: number } {
  return { text: text.slice(0, start) + snippet + text.slice(end), cursor: start + snippet.length }
}
