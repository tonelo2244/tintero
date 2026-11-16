/**
 * Insertar > Símbolo (fase 16): los caracteres que no están en el teclado español y se usan de
 * verdad en documentos, con su nombre para buscarlos. No es la tabla Unicode entera (sería
 * inmanejable); para lo raro está el visor de caracteres del sistema.
 */

export interface SymbolEntry {
  char: string
  name: string
}

export interface SymbolGroup {
  label: string
  symbols: SymbolEntry[]
}

const group = (label: string, entries: [string, string][]): SymbolGroup => ({
  label,
  symbols: entries.map(([char, name]) => ({ char, name }))
})

export const SYMBOL_GROUPS: SymbolGroup[] = [
  group('Más usados', [
    ['©', 'copyright'],
    ['®', 'marca registrada'],
    ['™', 'marca comercial'],
    ['€', 'euro'],
    ['°', 'grado'],
    ['±', 'más o menos'],
    ['×', 'multiplicación por'],
    ['÷', 'división entre'],
    ['→', 'flecha derecha'],
    ['✓', 'marca de verificación visto bueno'],
    ['•', 'viñeta punto'],
    ['…', 'puntos suspensivos'],
    ['—', 'raya guion largo'],
    ['–', 'semirraya guion medio'],
    ['«', 'comillas angulares apertura'],
    ['»', 'comillas angulares cierre']
  ]),
  group('Puntuación y tipografía', [
    ['“', 'comillas inglesas apertura'],
    ['”', 'comillas inglesas cierre'],
    ['‘', 'comilla simple apertura'],
    ['’', 'comilla simple cierre apóstrofo'],
    ['¿', 'interrogación apertura'],
    ['¡', 'exclamación apertura'],
    ['§', 'sección párrafo legal'],
    ['¶', 'calderón marca de párrafo'],
    ['†', 'cruz daga obelisco'],
    ['‡', 'doble cruz'],
    ['·', 'punto medio'],
    ['ª', 'ordinal femenino'],
    ['º', 'ordinal masculino'],
    ['‰', 'por mil'],
    ['№', 'número'],
    [' ', 'espacio de no separación']
  ]),
  group('Monedas', [
    ['€', 'euro'],
    ['$', 'dólar'],
    ['£', 'libra'],
    ['¥', 'yen yuan'],
    ['¢', 'centavo'],
    ['₿', 'bitcoin'],
    ['₹', 'rupia'],
    ['₽', 'rublo']
  ]),
  group('Matemáticas', [
    ['≈', 'aproximadamente igual'],
    ['≠', 'distinto no igual'],
    ['≤', 'menor o igual'],
    ['≥', 'mayor o igual'],
    ['∞', 'infinito'],
    ['√', 'raíz cuadrada'],
    ['∑', 'sumatorio suma'],
    ['∏', 'productorio producto'],
    ['∫', 'integral'],
    ['∂', 'derivada parcial'],
    ['∆', 'incremento delta'],
    ['∇', 'nabla gradiente'],
    ['∈', 'pertenece a'],
    ['∉', 'no pertenece a'],
    ['⊂', 'subconjunto'],
    ['∪', 'unión'],
    ['∩', 'intersección'],
    ['∀', 'para todo'],
    ['∃', 'existe'],
    ['¬', 'negación no'],
    ['∧', 'y lógico conjunción'],
    ['∨', 'o lógico disyunción'],
    ['½', 'un medio mitad'],
    ['¼', 'un cuarto'],
    ['¾', 'tres cuartos'],
    ['¹', 'superíndice uno'],
    ['²', 'al cuadrado superíndice dos'],
    ['³', 'al cubo superíndice tres']
  ]),
  group('Letras griegas', [
    ['α', 'alfa'],
    ['β', 'beta'],
    ['γ', 'gamma'],
    ['δ', 'delta'],
    ['ε', 'épsilon'],
    ['θ', 'theta zeta'],
    ['λ', 'lambda'],
    ['μ', 'mu micro'],
    ['π', 'pi'],
    ['σ', 'sigma'],
    ['φ', 'fi phi'],
    ['ω', 'omega'],
    ['Γ', 'gamma mayúscula'],
    ['Δ', 'delta mayúscula'],
    ['Σ', 'sigma mayúscula'],
    ['Ω', 'omega mayúscula ohmio']
  ]),
  group('Flechas', [
    ['←', 'flecha izquierda'],
    ['↑', 'flecha arriba'],
    ['↓', 'flecha abajo'],
    ['↔', 'flecha doble horizontal'],
    ['⇒', 'implica flecha doble derecha'],
    ['⇔', 'si y solo si equivalencia'],
    ['↗', 'flecha diagonal sube'],
    ['↘', 'flecha diagonal baja']
  ]),
  group('Varios', [
    ['✗', 'aspa cruz no'],
    ['★', 'estrella llena'],
    ['☆', 'estrella vacía'],
    ['♥', 'corazón'],
    ['♦', 'diamante rombo'],
    ['♣', 'trébol'],
    ['♠', 'pica'],
    ['☐', 'casilla vacía'],
    ['☑', 'casilla marcada'],
    ['☎', 'teléfono'],
    ['✉', 'sobre correo'],
    ['♪', 'nota musical']
  ])
]

/** Minúsculas y sin tildes: "raiz" encuentra "raíz". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Busca por nombre (cada palabra escrita tiene que aparecer) o por el propio carácter. Sin
 * repetidos: el euro está en "Más usados" y en "Monedas".
 */
export function searchSymbols(query: string): SymbolEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const seen = new Set<string>()
  const found: SymbolEntry[] = []
  for (const entry of SYMBOL_GROUPS.flatMap((candidate) => candidate.symbols)) {
    if (seen.has(entry.char)) continue
    const name = fold(entry.name)
    if (query.trim() === entry.char || (words.length > 0 && words.every((word) => name.includes(word)))) {
      seen.add(entry.char)
      found.push(entry)
    }
  }
  return found
}

export const RECENT_SYMBOLS_MAX = 16

/** Lista de usados recientemente: el último delante, sin repetir y con un máximo. */
export function withRecentSymbol(recent: readonly string[], char: string, max = RECENT_SYMBOLS_MAX): string[] {
  return [char, ...recent.filter((existing) => existing !== char)].slice(0, max)
}

/** Nombre de un carácter de la lista (para la ayuda emergente), o el propio carácter. */
export function symbolName(char: string): string {
  return SYMBOL_GROUPS.flatMap((candidate) => candidate.symbols).find((entry) => entry.char === char)?.name ?? char
}
