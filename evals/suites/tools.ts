import { proposeToolCalls } from '@/core/ai/tools'
import { presentationFromOutline } from '@/apps/slides/model/outline'
import { presentationReducer } from '@/apps/slides/model/presentationReducer'
import { plainText } from '@/apps/slides/model/richText'
import { buildSlideAgentRequest, interpretSlideCalls } from '@/apps/slides/model/ai/slideTools'
import type { Presentation, TextElement } from '@/apps/slides/model/types'
import { getCellValue, updateEvaluation } from '@/apps/sheets/model/calc'
import { describeSheet } from '@/apps/sheets/model/ai/sheetContext'
import { buildSheetAgentRequest, interpretSheetCalls } from '@/apps/sheets/model/ai/sheetTools'
import type { Workbook } from '@/apps/sheets/model/types'
import { workbookReducer } from '@/apps/sheets/model/workbookReducer'
import { check } from '../lib/checks'
import { defineSuite, type CheckResult, type EvalCase } from '../lib/types'
import { fixtureBook } from './sheets'

/**
 * Tool calling: se mide el RESULTADO, no las llamadas. Da igual si el modelo pone los títulos en
 * negrita con una llamada o con tres: se aplican sus cambios a una copia y se comprueba el estado
 * final. Por eso aquí los casos son código y no JSON: las expectativas son funciones del estado.
 */
const titleOf = (presentation: Presentation, index: number) => {
  const slide = presentation.slides.at(index)
  const title = slide?.elements.find((element) => element.type === 'text' && element.role === 'title') as
    TextElement | undefined
  return title ? plainText(title.paragraphs) : ''
}

function samplePresentation(): Presentation {
  return presentationFromOutline({
    title: 'Plan de lanzamiento',
    subtitle: 'Equipo de producto',
    slides: [
      { title: 'Objetivos', bullets: ['Llegar a mil usuarios', 'Medir la retención'], notes: '' },
      { title: 'Calendario', bullets: ['Beta en marzo', 'Versión 1.0 en junio'], notes: '' },
      { title: 'Riesgos', bullets: ['Equipo pequeño', 'Pagos sin probar'], notes: '' }
    ]
  })
}

interface SlideToolCase extends EvalCase {
  request: string
  expect(before: Presentation, after: Presentation): CheckResult[]
}

const slideCases: SlideToolCase[] = [
  {
    id: 'negrita-y-conclusiones',
    why: 'El ejemplo del roadmap: dos cambios de tipo distinto en una sola petición.',
    request: 'Pon en negrita los títulos y añade al final una diapositiva de conclusiones',
    expect: (before, after) => [
      check(
        'todos los títulos en negrita',
        after.slides.every((slide) =>
          slide.elements.every((element) => element.type !== 'text' || element.role !== 'title' || element.style.bold)
        )
      ),
      check('una diapositiva más', after.slides.length === before.slides.length + 1, `${after.slides.length}`),
      check('la última es de conclusiones', /conclusi/i.test(titleOf(after, -1)), `«${titleOf(after, -1)}»`)
    ]
  },
  {
    id: 'tema',
    why: 'Elegir un valor de una lista cerrada (enum).',
    request: 'Cambia el diseño al tema Bosque',
    expect: (_before, after) => [check('tema bosque', after.themeId === 'bosque', after.themeId)]
  },
  {
    id: 'borrar-por-nombre',
    why: 'Tiene que encontrar el número de la diapositiva a partir de su título.',
    request: 'Elimina la diapositiva del calendario',
    expect: (before, after) => [
      check('ya no está', !after.slides.some((_, index) => titleOf(after, index) === 'Calendario')),
      check('solo se borra una', after.slides.length === before.slides.length - 1, `${after.slides.length}`)
    ]
  },
  {
    id: 'mover',
    why: 'Números relativos ("la última") y posiciones.',
    request: 'Mueve la última diapositiva para que sea la segunda',
    expect: (_before, after) => [
      check('Riesgos es la segunda', titleOf(after, 1) === 'Riesgos', `«${titleOf(after, 1)}»`)
    ]
  }
]

export const slideToolsSuite = defineSuite<SlideToolCase>({
  id: 'herramientas-diapositivas',
  description: 'Cambios en una presentación con tool calling (estado final)',
  structured: true,
  cases: slideCases,
  async run(testCase, context) {
    const before = samplePresentation()
    const proposal = await proposeToolCalls(context.ai, buildSlideAgentRequest(before, testCase.request), (calls) =>
      interpretSlideCalls(before, calls)
    )
    const after = proposal.steps.flatMap((step) => step.actions).reduce(presentationReducer, before)
    return {
      output: [...proposal.steps.map((step) => `✓ ${step.label}`), ...proposal.problems.map((p) => `✗ ${p}`)].join(
        '\n'
      ),
      checks: [
        check('propone algún cambio', proposal.steps.length > 0, proposal.text || undefined),
        ...testCase.expect(before, after)
      ]
    }
  }
})

interface SheetToolCase extends EvalCase {
  request: string
  activeCell: string
  expect(after: Workbook, value: (address: string) => unknown): CheckResult[]
}

const sheetCases: SheetToolCase[] = [
  {
    id: 'cabecera',
    why: 'Formato sobre un rango deducido de los datos.',
    request: 'Pon en negrita la fila de cabeceras',
    activeCell: 'A1',
    expect: (after) => [
      check(
        'A1:C1 en negrita',
        ['A1', 'B1', 'C1'].every((address) => after.sheets[0].cells[address]?.style?.bold === true)
      ),
      check('no toca los datos', after.sheets[0].cells.A2?.style?.bold !== true)
    ]
  },
  {
    id: 'fila-de-totales',
    why: 'Escribir texto y fórmulas que el parser debe aceptar, debajo de los datos.',
    request: 'Añade debajo de los datos una fila "Total" con la suma de ventas y de unidades',
    activeCell: 'A6',
    expect: (_after, value) => [
      check('total de ventas 4450', [value('B6'), value('B7')].includes(4450), `B6=${value('B6')}`),
      check('total de unidades 95', [value('C6'), value('C7')].includes(95), `C6=${value('C6')}`)
    ]
  },
  {
    id: 'moneda',
    why: 'Formato de número sobre una columna concreta.',
    request: 'Pon formato de moneda a las ventas',
    activeCell: 'B2',
    expect: (after) => [
      check(
        'B2:B5 en moneda',
        ['B2', 'B3', 'B4', 'B5'].every(
          (address) => after.sheets[0].cells[address]?.style?.numberFormat?.kind === 'currency'
        )
      )
    ]
  }
]

export const sheetToolsSuite = defineSuite<SheetToolCase>({
  id: 'herramientas-hojas',
  description: 'Cambios en una hoja con tool calling (estado final)',
  structured: true,
  cases: sheetCases,
  async run(testCase, context) {
    const { workbook, sheet, evaluation } = fixtureBook('ventas')
    const proposal = await proposeToolCalls(
      context.ai,
      buildSheetAgentRequest(describeSheet(sheet, evaluation).text, testCase.activeCell, testCase.request),
      (calls) => interpretSheetCalls(workbook, { sheetId: sheet.id, evaluation }, calls)
    )
    const after = proposal.steps.flatMap((step) => step.actions).reduce(workbookReducer, workbook)
    const values = updateEvaluation(evaluation, after)
    return {
      output: [...proposal.steps.map((step) => `✓ ${step.label}`), ...proposal.problems.map((p) => `✗ ${p}`)].join(
        '\n'
      ),
      checks: [
        check('propone algún cambio', proposal.steps.length > 0, proposal.text || undefined),
        ...testCase.expect(after, (address) => getCellValue(values, sheet.id, address))
      ]
    }
  }
})
