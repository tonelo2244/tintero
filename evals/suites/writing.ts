import { generateText } from '@/core/ai/text'
import {
  buildWritingRequest,
  cleanModelText,
  splitParagraphs,
  writingAction,
  type WritingActionId
} from '@/apps/writer/model/ai/writingActions'
import { ungroundedNumbers, extractNumbers } from '@/core/ai/grounding'
import proofreadCases from '../cases/proofread.json'
import rewriteCases from '../cases/rewrite.json'
import summarizeCases from '../cases/summarize.json'
import {
  check,
  containsAll,
  containsNone,
  inLanguage,
  lengthRatio,
  noPreamble,
  similarTo,
  type Language
} from '../lib/checks'
import type { RubricCriterion } from '../lib/judge'
import { defineSuite, type CheckResult, type EvalCase, type EvalContext } from '../lib/types'

/** Ejecuta una acción del asistente exactamente como la app: mismo prompt, misma limpieza. */
async function runWritingAction(context: EvalContext, id: WritingActionId, input: string): Promise<string> {
  const text = await generateText(context.ai, buildWritingRequest(writingAction(id), input))
  return cleanModelText(text)
}

interface ProofreadCase extends EvalCase {
  input: string
  expected: string
  mustContain?: string[]
  mustNotContain?: string[]
  minSimilarity?: number
  paragraphs?: number
  language?: Language
}

export const proofreadSuite = defineSuite<ProofreadCase>({
  id: 'corregir',
  description: 'Corregir ortografía y gramática sin cambiar el estilo',
  structured: false,
  cases: proofreadCases as ProofreadCase[],
  async run(testCase, context) {
    const output = await runWritingAction(context, 'proofread', testCase.input)
    const checks: CheckResult[] = [
      noPreamble(output),
      // Corregir debe tocar poco: si se parece poco a lo esperado, el modelo reescribió.
      similarTo(output, testCase.expected, testCase.minSimilarity ?? 0.9)
    ]
    if (testCase.mustContain) checks.push(containsAll(output, testCase.mustContain))
    if (testCase.mustNotContain) checks.push(containsNone(output, testCase.mustNotContain))
    if (testCase.language) checks.push(inLanguage(output, testCase.language))
    if (testCase.paragraphs) {
      const count = splitParagraphs(output).length
      checks.push(check(`${testCase.paragraphs} párrafos`, count === testCase.paragraphs, `salieron ${count}`))
    }
    return { output, checks }
  }
})

interface RewriteCase extends EvalCase {
  action: 'improve' | 'formal' | 'shorter'
  input: string
  /** Datos que deben sobrevivir a la reescritura (nombres, cifras, fechas). */
  keep: string[]
  maxRatio: number
}

const REWRITE_RUBRICS: Record<RewriteCase['action'], RubricCriterion[]> = {
  improve: [
    {
      id: 'significado',
      description: 'Conserva exactamente el significado y los datos del original, sin añadir nada.'
    },
    { id: 'claridad', description: 'Es más claro y fluido que el original, sin repeticiones.' },
    { id: 'correccion', description: 'No tiene faltas de ortografía ni de gramática.' }
  ],
  formal: [
    {
      id: 'significado',
      description: 'Conserva el significado y no inventa datos (fechas, motivos, nombres) que no estaban.'
    },
    { id: 'tono', description: 'El tono es formal y profesional, sin coloquialismos.' },
    { id: 'naturalidad', description: 'Suena natural, como lo escribiría una persona, sin exagerar la formalidad.' }
  ],
  shorter: [
    { id: 'significado', description: 'Conserva las ideas clave y los datos del original.' },
    { id: 'concision', description: 'Es claramente más corto y no tiene palabras de relleno.' }
  ]
}

export const rewriteSuite = defineSuite<RewriteCase>({
  id: 'reescribir',
  description: 'Mejorar redacción, más formal y más breve',
  structured: false,
  cases: rewriteCases as RewriteCase[],
  async run(testCase, context) {
    const output = await runWritingAction(context, testCase.action, testCase.input)
    const checks = [
      noPreamble(output),
      containsAll(output, testCase.keep, 'conserva los datos'),
      lengthRatio(output, testCase.input, 0.2, testCase.maxRatio),
      inLanguage(output, 'es')
    ]
    const judge = await context.judge({
      task: writingAction(testCase.action).instruction,
      input: testCase.input,
      output,
      rubric: REWRITE_RUBRICS[testCase.action]
    })
    return { output, checks, judge }
  }
})

interface SummarizeCase extends EvalCase {
  input: string
  mustContain?: string[]
  language: Language
}

export const summarizeSuite = defineSuite<SummarizeCase>({
  id: 'resumir',
  description: 'Resumir un documento (fiel, breve y en su idioma)',
  structured: false,
  cases: summarizeCases as SummarizeCase[],
  async run(testCase, context) {
    const output = await runWritingAction(context, 'summarize', testCase.input)
    const invented = ungroundedNumbers(output, extractNumbers(testCase.input))
    const checks = [
      noPreamble(output),
      lengthRatio(output, testCase.input, 0.05, 0.6),
      inLanguage(output, testCase.language),
      check(
        'sin cifras inventadas',
        invented.length === 0,
        invented.length ? `inventa: ${invented.join(', ')}` : undefined
      )
    ]
    if (testCase.mustContain) checks.push(containsAll(output, testCase.mustContain))
    const judge = await context.judge({
      task: writingAction('summarize').instruction,
      input: testCase.input,
      output,
      rubric: SUMMARY_RUBRIC
    })
    return { output, checks, judge }
  }
})

export const SUMMARY_RUBRIC: RubricCriterion[] = [
  { id: 'fidelidad', description: 'Todo lo que dice el resumen está en el documento: no inventa ni tergiversa nada.' },
  { id: 'cobertura', description: 'Recoge las ideas y decisiones principales del documento.' },
  { id: 'concision', description: 'Es breve y va al grano, sin repetir el documento.' }
]
