import { describe, expect, it } from 'vitest'
import type { CellValue } from '../types'
import { evaluateFormula, type EvaluationContext } from './evaluate'
import { buildCriterion } from './functions'
import { parseFormula } from './parser'
import { printFormula } from './printer'
import { tokenize } from './tokenizer'
import { renameSheetInFormula, shiftFormula, toCanonicalFormula, toLocalizedFormula } from './transform'

/** Contexto de prueba: una hoja con valores fijos, A1..A3 = 1, 2, 3; B1 = "hola". */
const CELLS: Record<string, CellValue> = { A1: 1, A2: 2, A3: 3, B1: 'hola', B2: true, C1: { error: '#DIV/0!' } }
const context: EvaluationContext = {
  cell: (sheet, row, col) =>
    sheet === 'Nada' ? { error: '#REF!' } : (CELLS[String.fromCharCode(65 + col) + (row + 1)] ?? null),
  range: (sheet, start, end) =>
    sheet === 'Nada'
      ? null
      : {
          kind: 'matrix',
          rows: end.row - start.row + 1,
          cols: end.col - start.col + 1,
          get: (row, col) => CELLS[String.fromCharCode(65 + start.col + col) + (start.row + row + 1)] ?? null
        }
}

const calc = (formula: string) => evaluateFormula(parseFormula(formula), context)

describe('tokenizer', () => {
  it('reconoce referencias, hojas, textos y separadores', () => {
    expect(tokenize(`SUMA($A$1:B2;'Mis datos'!C3,"a""b")`)).toEqual([
      { type: 'func', name: 'SUMA' },
      { type: 'paren', value: '(' },
      { type: 'ref', value: '$A$1' },
      { type: 'colon' },
      { type: 'ref', value: 'B2' },
      { type: 'separator' },
      { type: 'ref', sheet: 'Mis datos', value: 'C3' },
      { type: 'separator' },
      { type: 'string', value: 'a"b' },
      { type: 'paren', value: ')' }
    ])
  })

  it('falla con comillas sin cerrar', () => {
    expect(() => tokenize('"abc')).toThrow(/comillas/)
  })
})

describe('parser y evaluación', () => {
  it('respeta la precedencia de Excel', () => {
    expect(calc('1+2*3')).toBe(7)
    expect(calc('(1+2)*3')).toBe(9)
    expect(calc('-2^2')).toBe(4)
    expect(calc('2^3^2')).toBe(64)
    expect(calc('50%*10')).toBe(5)
    expect(calc('1+2&"x"')).toBe('3x')
    expect(calc('1+1=2')).toBe(true)
  })

  it('lee celdas y rangos, y una celda vacía cuenta como 0', () => {
    expect(calc('A1+A2')).toBe(3)
    expect(calc('Z99')).toBe(0)
    expect(calc('Z99+1')).toBe(1)
    expect(calc('SUMA(A1:A3)')).toBe(6)
  })

  it('acepta nombres en español e inglés y los dos separadores', () => {
    expect(calc('PROMEDIO(A1:A3;10)')).toBe(4)
    expect(calc('AVERAGE(A1:A3,10)')).toBe(4)
    expect(calc('SI(A1>0;"sí";"no")')).toBe('sí')
    expect(calc('SI(A1>5;"sí")')).toBe(false)
  })

  it('produce los errores de Excel', () => {
    expect(calc('1/0')).toEqual({ error: '#DIV/0!' })
    expect(calc('B1*2')).toEqual({ error: '#VALUE!' })
    expect(calc('NOEXISTE(1)')).toEqual({ error: '#NAME?' })
    expect(calc('Nada!A1')).toEqual({ error: '#REF!' })
    expect(calc('SUMA(Nada!A1:A2)')).toEqual({ error: '#REF!' })
    expect(calc('A1:A3')).toEqual({ error: '#VALUE!' })
    expect(calc('C1+1')).toEqual({ error: '#DIV/0!' })
    expect(calc('SI.ERROR(C1;"ok")')).toBe('ok')
    expect(calc('RAIZ(-1)')).toEqual({ error: '#NUM!' })
  })

  it('convierte tipos como Excel', () => {
    expect(calc('B2+1')).toBe(2)
    expect(calc('"3"+1')).toBe(4)
    expect(calc('"3,5"*2')).toBe(7)
    expect(calc('1.5&""')).toBe('1,5')
    expect(calc('0.1+0.2&""')).toBe('0,3')
    expect(calc('B2&""')).toBe('VERDADERO')
    expect(calc('"abc"="ABC"')).toBe(true)
  })

  it('implementa las funciones habituales', () => {
    expect(calc('CONTAR(A1:B2)')).toBe(2)
    expect(calc('CONTARA(A1:B2)')).toBe(4)
    expect(calc('MAX(A1:A3)')).toBe(3)
    expect(calc('MIN(A1:A3;-1)')).toBe(-1)
    expect(calc('PRODUCTO(A1:A3)')).toBe(6)
    expect(calc('REDONDEAR(2.345;2)')).toBe(2.35)
    expect(calc('REDONDEAR(-2.5;0)')).toBe(-3)
    expect(calc('REDONDEAR(1.005;2)')).toBe(1.01)
    expect(calc('RESIDUO(-3;2)')).toBe(1)
    expect(calc('ENTERO(-1.5)')).toBe(-2)
    expect(calc('Y(VERDADERO;A1>0)')).toBe(true)
    expect(calc('O(FALSO;A1>5)')).toBe(false)
    expect(calc('NO(A1)')).toBe(false)
    expect(calc('CONCATENAR("a";A1;"b")')).toBe('a1b')
    expect(calc('CONCAT(A1:A3)')).toBe('123')
    expect(calc('LARGO(B1)')).toBe(4)
    expect(calc('MAYUSC(B1)')).toBe('HOLA')
    expect(calc('IZQUIERDA(B1;2)&DERECHA(B1)')).toBe('hoa')
    expect(calc('ESPACIOS("  a   b ")')).toBe('a b')
    expect(calc('SUMAR.SI(A1:A3;">1")')).toBe(5)
    expect(calc('CONTAR.SI(A1:B1;"ho*")')).toBe(1)
    expect(calc('SUMA()')).toEqual({ error: '#VALUE!' })
  })

  it('BUSCARV busca exacto y aproximado', () => {
    // Tabla A1:B3 -> (1, "hola"), (2, VERDADERO), (3, vacío)
    expect(calc('BUSCARV(2;A1:B3;2;FALSO)')).toBe(true)
    expect(calc('BUSCARV(9;A1:B3;2;FALSO)')).toEqual({ error: '#N/A' })
    expect(calc('BUSCARV(1.5;A1:B3;2)')).toBe('hola')
    expect(calc('BUSCARV(1;A1:B3;3;FALSO)')).toEqual({ error: '#REF!' })
  })

  it('rechaza fórmulas mal escritas', () => {
    expect(() => parseFormula('1+')).toThrow()
    expect(() => parseFormula('SUMA(1;2')).toThrow()
    expect(() => parseFormula('(1))')).toThrow()
    expect(() => parseFormula('A0')).toThrow()
  })
})

describe('criterios de SUMAR.SI', () => {
  it('entiende operadores, comodines y valores', () => {
    expect(buildCriterion('>=2')(2)).toBe(true)
    expect(buildCriterion('<>listo')('Listo')).toBe(false)
    expect(buildCriterion('<>listo')(null)).toBe(true)
    expect(buildCriterion('ma?a')('mapa')).toBe(true)
    expect(buildCriterion(3)(3)).toBe(true)
    expect(buildCriterion('>5')('texto')).toBe(false)
  })
})

describe('traducción y transformaciones', () => {
  it('guarda en inglés y enseña en español', () => {
    expect(toCanonicalFormula('suma(A1:A3;2) & SI.ERROR(B1;"x")')).toBe('SUM(A1:A3,2)&IFERROR(B1,"x")')
    expect(toLocalizedFormula('IF(A1>=1,TRUE,#N/A)')).toBe('SI(A1>=1;VERDADERO;#N/D)')
    expect(printFormula(parseFormula("'Mis datos'!A1+Hoja2!B2"), 'canonical')).toBe("'Mis datos'!A1+Hoja2!B2")
  })

  it('mueve las referencias relativas al copiar y respeta las absolutas', () => {
    expect(shiftFormula('A1+$B$1+B$2+$C3', 1, 1)).toBe('B2+$B$1+C$2+$C4')
    expect(shiftFormula('SUM(A1:A3)', 2, 0)).toBe('SUM(A3:A5)')
    expect(shiftFormula('A1+1', -1, 0)).toBe('#REF!+1')
  })

  it('renombra hojas dentro de las fórmulas', () => {
    expect(renameSheetInFormula('Hoja1!A1+hoja1!B1:B2+C1', 'Hoja1', 'Ventas 2026')).toBe(
      "'Ventas 2026'!A1+'Ventas 2026'!B1:B2+C1"
    )
    expect(renameSheetInFormula('A1 + 1', 'Hoja1', 'Otra')).toBe('A1 + 1')
  })
})
