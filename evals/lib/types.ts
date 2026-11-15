import type { AiApi } from '@shared/ai'
import type { Judge } from './judge'

/** Resultado de una comprobación determinista ("contiene «había»", "la fórmula da 150"...). */
export interface CheckResult {
  name: string
  passed: boolean
  /** Qué se esperaba y qué salió, para entender un fallo sin volver a ejecutar. */
  detail?: string
}

/** Veredicto del juez LLM: una nota de 1 a 5 por criterio de la rúbrica. */
export interface JudgeVerdict {
  scores: { id: string; score: number; reason: string }[]
  /** Media normalizada a 0..1. */
  score01: number
  /** Aprobado si todos los criterios llegan a la nota mínima. */
  passed: boolean
}

/** Lo que devuelve una suite al ejecutar un caso. */
export interface CaseOutcome {
  /** La salida tal como la usaría la app (texto limpio, fórmula, JSON...). */
  output: string
  checks: CheckResult[]
  judge?: JudgeVerdict
}

/** Una llamada al modelo, medida por el adaptador (evalAi.ts). */
export interface CallRecord {
  ms: number
  /** Tiempo hasta el primer trozo de texto (lo que nota el usuario como "empieza a escribir"). */
  firstTokenMs: number | null
  outputChars: number
}

export interface CaseResult {
  suite: string
  caseId: string
  /** Repetición (con --repeat N, cada caso se ejecuta N veces: el modelo no es determinista). */
  run: number
  passed: boolean
  /** 0..1: proporción de comprobaciones superadas, con la nota del juez como una más. */
  score: number
  output: string
  checks: CheckResult[]
  judge?: JudgeVerdict
  /** Excepción (modelo caído, JSON inválido tras todos los reintentos...). Cuenta como suspenso. */
  error?: string
  /** Latencia total del caso, sumando reintentos (sin contar al juez). */
  latencyMs: number
  firstTokenMs: number | null
  /** Llamadas al modelo de la función evaluada: 1 = a la primera; más = hubo reintentos. */
  calls: number
}

export interface EvalContext {
  /** La misma interfaz que usa la app (platform.ai), conectada directamente al runtime. */
  ai: AiApi
  judge: Judge
}

export interface EvalCase {
  id: string
  /** Por qué existe el caso (de qué fallo real o riesgo viene). Sale en el informe. */
  why?: string
}

export interface EvalSuite<C extends EvalCase = EvalCase> {
  id: string
  description: string
  /** Salida estructurada (JSON con esquema): el informe mide "JSON válido a la primera". */
  structured: boolean
  cases: C[]
  run(testCase: C, context: EvalContext): Promise<CaseOutcome>
}

/** Ayuda de tipos: cada suite declara su tipo de caso y el runner las trata a todas igual. */
export function defineSuite<C extends EvalCase>(suite: EvalSuite<C>): EvalSuite {
  return suite as unknown as EvalSuite
}
