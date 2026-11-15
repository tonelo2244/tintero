import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateWorkbook, getCellValue, updateEvaluation } from '../calc'
import { createSheet, createWorkbook } from '../factories'
import { dateToSerial } from '../format'
import type { Cell, CellValue } from '../types'
import { workbookReducer } from '../workbookReducer'
import { parseFormula } from './parser'
import { printFormula } from './printer'
import { formatText } from './textFormat'
import { shiftFormula, toCanonicalFormula, toLocalizedFormula } from './transform'

/**
 * Funciones de la fase 9 y referencias a columnas/filas enteras, probadas sobre un libro real
 * (con el motor de cálculo), que es como las usa la app.
 */
const DATA: Record<string, Cell> = {
  A1: { value: 'Producto' },
  B1: { value: 'Zona' },
  C1: { value: 'Ventas' },
  A2: { value: 'Pan' },
  B2: { value: 'Norte' },
  C2: { value: 10 },
  A3: { value: 'Leche' },
  B3: { value: 'Sur' },
  C3: { value: 25 },
  A4: { value: 'Pan' },
  B4: { value: 'Sur' },
  C4: { value: 5 },
  A5: { value: 'Huevos' },
  B5: { value: 'Norte' },
  C5: { value: 40 }
}

function calc(formula: string, extra: Record<string, Cell> = {}): CellValue {
  const sheet = createSheet('Hoja1', {
    ...DATA,
    ...extra,
    Z1: { formula: toCanonicalFormula(formula.replace(/^=/, '')) }
  })
  const workbook = createWorkbook([sheet])
  return getCellValue(evaluateWorkbook(workbook), sheet.id, 'Z1')
}

describe('columnas y filas enteras', () => {
  it('se leen, se imprimen y no se mueven al copiar', () => {
    expect(printFormula(parseFormula('SUMA(C:C)'), 'canonical')).toBe('SUM(C:C)')
    expect(printFormula(parseFormula("SUM('Mis datos'!$A:B,2:3)"), 'es')).toBe("SUMA('Mis datos'!$A:B;2:3)")
    expect(shiftFormula('SUM(C:C)', 5, 0)).toBe('SUM(C:C)')
    expect(shiftFormula('SUM(C:C)', 0, 1)).toBe('SUM(D:D)')
    expect(shiftFormula('SUM(2:2)', 1, 3)).toBe('SUM(3:3)')
    expect(calc('=SUMA(C:C)')).toBe(80)
    expect(calc('=CONTARA(2:2)')).toBe(3)
    expect(calc('=SUMAR.SI(A:A;"Pan";C:C)')).toBe(15)
  })

  it('no confunde un rango normal ni una hora escrita como texto', () => {
    expect(printFormula(parseFormula('SUM(A1:B2)'), 'canonical')).toBe('SUM(A1:B2)')
    expect(calc('="10:30"')).toBe('10:30')
  })
})

describe('condicionales', () => {
  it('SUMAR.SI.CONJUNTO, CONTAR.SI.CONJUNTO, PROMEDIO.SI y PROMEDIO.SI.CONJUNTO', () => {
    expect(calc('=SUMAR.SI.CONJUNTO(C2:C5;A2:A5;"Pan";B2:B5;"Sur")')).toBe(5)
    expect(calc('=CONTAR.SI.CONJUNTO(B2:B5;"Norte";C2:C5;">20")')).toBe(1)
    expect(calc('=PROMEDIO.SI(B2:B5;"Sur";C2:C5)')).toBe(15)
    expect(calc('=PROMEDIO.SI.CONJUNTO(C2:C5;B2:B5;"Norte")')).toBe(25)
    expect(calc('=PROMEDIO.SI(B2:B5;"Este";C2:C5)')).toEqual({ error: '#DIV/0!' })
    // Rangos de distinto tamaño: #¡VALOR!, como en Excel.
    expect(calc('=SUMAR.SI.CONJUNTO(C2:C5;A2:A4;"Pan")')).toEqual({ error: '#VALUE!' })
  })

  it('SI.CONJUNTO devuelve la primera condición cierta o #N/D', () => {
    expect(calc('=SI.CONJUNTO(C3>30;"alto";C3>20;"medio";VERDADERO;"bajo")')).toBe('medio')
    expect(calc('=SI.CONJUNTO(C3>30;"alto")')).toEqual({ error: '#N/A' })
  })
})

describe('búsqueda', () => {
  it('BUSCARX exacta, con valor por defecto, aproximada, con comodines y desde el final', () => {
    expect(calc('=BUSCARX("Leche";A2:A5;C2:C5)')).toBe(25)
    expect(calc('=BUSCARX("Sal";A2:A5;C2:C5;"no hay")')).toBe('no hay')
    expect(calc('=BUSCARX("Sal";A2:A5;C2:C5)')).toEqual({ error: '#N/A' })
    expect(calc('=BUSCARX(30;C2:C5;A2:A5;;-1)')).toBe('Leche')
    expect(calc('=BUSCARX(30;C2:C5;A2:A5;;1)')).toBe('Huevos')
    expect(calc('=BUSCARX("Hue*";A2:A5;C2:C5;;2)')).toBe(40)
    expect(calc('=BUSCARX("Pan";A2:A5;C2:C5;;0;-1)')).toBe(5)
    expect(calc('=BUSCARX("Zona";A1:C1;A3:C3)')).toBe('Sur')
  })

  it('INDICE + COINCIDIR', () => {
    expect(calc('=INDICE(C2:C5;COINCIDIR("Huevos";A2:A5;0))')).toBe(40)
    expect(calc('=INDICE(A1:C5;3;2)')).toBe('Sur')
    expect(calc('=INDICE(A1:C1;2)')).toBe('Zona')
    expect(calc('=INDICE(A1:C5;9;1)')).toEqual({ error: '#REF!' })
    expect(calc('=COINCIDIR(26;D1:D3)', { D1: { value: 10 }, D2: { value: 20 }, D3: { value: 30 } })).toBe(2)
    expect(calc('=COINCIDIR(15;D1:D3;-1)', { D1: { value: 30 }, D2: { value: 20 }, D3: { value: 10 } })).toBe(2)
    expect(calc('=COINCIDIR("x";A2:A5;0)')).toEqual({ error: '#N/A' })
  })
})

describe('fechas', () => {
  afterEach(() => vi.useRealTimers())

  it('FECHA, AÑO, MES y DIA, con el desbordamiento de meses de Excel', () => {
    expect(calc('=FECHA(2024;3;15)')).toBe(dateToSerial(2024, 3, 15))
    expect(calc('=FECHA(2024;13;1)')).toBe(dateToSerial(2025, 1, 1))
    expect(calc('=FECHA(24;1;1)')).toBe(dateToSerial(1924, 1, 1))
    expect(calc('=AÑO(FECHA(2024;3;15))')).toBe(2024)
    expect(calc('=MES(FECHA(2024;3;15))')).toBe(3)
    expect(calc('=DIA(FECHA(2024;3;15))')).toBe(15)
    expect(calc('=DÍA(FECHA(2024;3;15))')).toBe(15)
  })

  it('HOY y AHORA usan la fecha del equipo y se recalculan aunque no cambien sus celdas', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 10, 12, 0, 0))
    const sheet = createSheet('Hoja1', { A1: { formula: 'TODAY()' }, A2: { formula: 'NOW()' } })
    const workbook = createWorkbook([sheet])
    const first = evaluateWorkbook(workbook)
    expect(getCellValue(first, sheet.id, 'A1')).toBe(dateToSerial(2026, 1, 10))
    expect(getCellValue(first, sheet.id, 'A2')).toBe(dateToSerial(2026, 1, 10) + 0.5)

    vi.setSystemTime(new Date(2026, 0, 11, 9, 0, 0))
    const edited = workbookReducer(workbook, { type: 'cells/set', sheetId: sheet.id, cells: { B1: { value: 1 } } })
    expect(getCellValue(updateEvaluation(first, edited), sheet.id, 'A1')).toBe(dateToSerial(2026, 1, 11))
  })
})

describe('texto y redondeo', () => {
  it('TEXTO con formatos en inglés y en español', () => {
    expect(formatText(1234.5, '#,##0.00')).toBe('1.234,50')
    expect(formatText(1234.5, '#.##0,00')).toBe('1.234,50')
    expect(formatText(1234.5, '0')).toBe('1235')
    expect(formatText(0.256, '0.0%')).toBe('25,6%')
    expect(formatText(12, '0.00 "€"')).toBe('12,00 €')
    const serial = dateToSerial(2024, 3, 5) + 0.75
    expect(formatText(serial, 'dd/mm/yyyy')).toBe('05/03/2024')
    expect(formatText(serial, 'dd/mm/aaaa')).toBe('05/03/2024')
    expect(formatText(serial, 'dddd d "de" mmmm')).toBe('martes 5 de marzo')
    expect(formatText(serial, 'hh:mm')).toBe('18:00')
    expect(calc('=TEXTO(C5;"0.00")')).toBe('40,00')
  })

  it('REDONDEAR.MAS y REDONDEAR.MENOS se alejan o acercan al cero', () => {
    expect(calc('=REDONDEAR.MAS(2.21;1)')).toBe(2.3)
    expect(calc('=REDONDEAR.MAS(-2.21;1)')).toBe(-2.3)
    expect(calc('=REDONDEAR.MENOS(2.29;1)')).toBe(2.2)
    expect(calc('=REDONDEAR.MAS(2;0)')).toBe(2)
    expect(calc('=REDONDEAR.MENOS(-2.9;0)')).toBe(-2)
  })

  it('CONTAR.BLANCO y SI.ND', () => {
    expect(calc('=CONTAR.BLANCO(A1:D2)')).toBe(2)
    expect(calc('=SI.ND(BUSCARX("x";A2:A5;C2:C5);0)')).toBe(0)
    expect(calc('=SI.ND(1/0;0)')).toEqual({ error: '#DIV/0!' })
  })

  it('las funciones nuevas se traducen en los dos sentidos', () => {
    expect(toCanonicalFormula('BUSCARX(A1;B:B;C:C)')).toBe('XLOOKUP(A1,B:B,C:C)')
    expect(toLocalizedFormula('IFS(A1>1,"a",TRUE,"b")')).toBe('SI.CONJUNTO(A1>1;"a";VERDADERO;"b")')
    expect(toLocalizedFormula('YEAR(TODAY())')).toBe('AÑO(HOY())')
  })
})
