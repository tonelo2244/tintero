import { createEvalAi } from './evalAi'
import { createJudge } from './judge'
import { summarizeSuite, type EvalReport, type RunInfo } from './report'
import type { CaseResult, EvalSuite } from './types'
import type { LocalModelRuntime } from '../../src/main/ai/ollamaClient'

export interface RunOptions {
  runtime: LocalModelRuntime
  model: string
  judgeModel: string
  suites: EvalSuite[]
  /** Solo los casos con estos ids (vacío = todos). */
  caseIds?: string[]
  repeat: number
  info: Omit<RunInfo, 'model' | 'judgeModel' | 'endpoint' | 'repeat'>
  onResult?: (result: CaseResult) => void
}

/**
 * Ejecuta las suites caso a caso y en serie: un modelo local atiende una petición a la vez, y en
 * paralelo solo mediríamos la cola (latencias falsas). El juez usa su propio adaptador para que
 * sus llamadas no cuenten como reintentos ni como latencia de la función evaluada.
 */
export async function runEvals(options: RunOptions): Promise<EvalReport> {
  const measured = createEvalAi(options.runtime, options.model)
  const judge = createJudge(createEvalAi(options.runtime, options.judgeModel).ai)
  const results: CaseResult[] = []
  const summaries = []

  for (const suite of options.suites) {
    const cases = suite.cases.filter((testCase) => !options.caseIds?.length || options.caseIds.includes(testCase.id))
    const suiteResults: CaseResult[] = []
    for (const testCase of cases) {
      for (let run = 1; run <= options.repeat; run++) {
        measured.takeCalls()
        const result = await runCase(suite, testCase, run, () => measured.takeCalls(), measured.ai, judge)
        suiteResults.push(result)
        options.onResult?.(result)
      }
    }
    if (suiteResults.length > 0) summaries.push(summarizeSuite(suite, suiteResults))
    results.push(...suiteResults)
  }

  return {
    info: {
      ...options.info,
      model: options.model,
      judgeModel: options.judgeModel,
      endpoint: options.runtime.endpoint,
      repeat: options.repeat
    },
    suites: summaries,
    results
  }
}

async function runCase(
  suite: EvalSuite,
  testCase: EvalSuite['cases'][number],
  run: number,
  takeCalls: ReturnType<typeof createEvalAi>['takeCalls'],
  ai: ReturnType<typeof createEvalAi>['ai'],
  judge: ReturnType<typeof createJudge>
): Promise<CaseResult> {
  const base = { suite: suite.id, caseId: testCase.id, run }
  try {
    const outcome = await suite.run(testCase, { ai, judge })
    const calls = takeCalls()
    const passedChecks = outcome.checks.filter((check) => check.passed).length
    const parts = outcome.checks.length + (outcome.judge ? 1 : 0)
    const score = parts === 0 ? 1 : (passedChecks + (outcome.judge?.score01 ?? 0)) / parts
    return {
      ...base,
      ...outcome,
      passed: passedChecks === outcome.checks.length && (outcome.judge?.passed ?? true),
      score,
      latencyMs: calls.reduce((sum, call) => sum + call.ms, 0),
      firstTokenMs: calls[0]?.firstTokenMs ?? null,
      calls: calls.length
    }
  } catch (error) {
    const calls = takeCalls()
    return {
      ...base,
      passed: false,
      score: 0,
      output: '',
      checks: [],
      error: error instanceof Error ? error.message : String(error),
      latencyMs: calls.reduce((sum, call) => sum + call.ms, 0),
      firstTokenMs: calls[0]?.firstTokenMs ?? null,
      calls: calls.length
    }
  }
}
