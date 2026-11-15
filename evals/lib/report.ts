import type { CaseResult } from './types'

export interface RunInfo {
  model: string
  judgeModel: string
  runtime: string
  endpoint: string
  startedAt: string
  /** Commit del código evaluado: un informe sin versión no se puede comparar con nada. */
  commit: string | null
  repeat: number
}

export interface SuiteSummary {
  suite: string
  description: string
  structured: boolean
  runs: number
  /** Proporción de ejecuciones aprobadas (todas las comprobaciones y el juez). */
  passRate: number
  meanScore: number
  /** Solo suites con salida estructurada (JSON o herramientas): ejecuciones válidas sin reintentar. */
  validFirstTryRate: number | null
  meanRetries: number | null
  errors: number
  latencyP50Ms: number
  latencyP95Ms: number
  firstTokenP50Ms: number | null
}

export interface EvalReport {
  info: RunInfo
  suites: SuiteSummary[]
  results: CaseResult[]
}

export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1))
  return sorted[index]
}

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0)

export function summarizeSuite(
  suite: { id: string; description: string; structured: boolean },
  results: CaseResult[]
): SuiteSummary {
  const latencies = results.map((result) => result.latencyMs)
  const firstTokens = results.map((result) => result.firstTokenMs).filter((value): value is number => value !== null)
  return {
    suite: suite.id,
    description: suite.description,
    structured: suite.structured,
    runs: results.length,
    passRate: mean(results.map((result) => (result.passed ? 1 : 0))),
    meanScore: mean(results.map((result) => result.score)),
    validFirstTryRate: suite.structured
      ? mean(results.map((result) => (!result.error && result.calls === 1 ? 1 : 0)))
      : null,
    meanRetries: suite.structured ? mean(results.map((result) => Math.max(0, result.calls - 1))) : null,
    errors: results.filter((result) => result.error).length,
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    firstTokenP50Ms: firstTokens.length ? percentile(firstTokens, 0.5) : null
  }
}

const pct = (value: number) => `${Math.round(value * 100)} %`
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

export function renderMarkdown(report: EvalReport, baseline?: EvalReport): string {
  const { info } = report
  const lines = [
    `# Evaluación de la IA de Tintero · ${info.model}`,
    '',
    `- Fecha: ${info.startedAt}`,
    `- Runtime: ${info.runtime} (${info.endpoint})`,
    `- Juez: ${info.judgeModel}`,
    `- Commit: ${info.commit ?? 'desconocido'}`,
    `- Repeticiones por caso: ${info.repeat}`,
    '',
    '| Suite | Ejecuciones | Aprobadas | Nota media | Válido a la primera | Reintentos | Latencia p50 / p95 | Primer texto p50 |',
    '| ----- | ----------: | --------: | ---------: | ----------------: | ---------: | -----------------: | ---------------: |'
  ]
  for (const suite of report.suites) {
    const before = baseline?.suites.find((candidate) => candidate.suite === suite.suite)
    const delta = before ? ` (${formatDelta(suite.passRate - before.passRate)})` : ''
    lines.push(
      `| ${suite.suite} | ${suite.runs} | ${pct(suite.passRate)}${delta} | ${suite.meanScore.toFixed(2)} | ${
        suite.validFirstTryRate === null ? '—' : pct(suite.validFirstTryRate)
      } | ${suite.meanRetries === null ? '—' : suite.meanRetries.toFixed(2)} | ${seconds(suite.latencyP50Ms)} / ${seconds(
        suite.latencyP95Ms
      )} | ${suite.firstTokenP50Ms === null ? '—' : seconds(suite.firstTokenP50Ms)} |`
    )
  }
  if (baseline)
    lines.push('', `Entre paréntesis, la diferencia con ${baseline.info.model} del ${baseline.info.startedAt}.`)

  const failures = report.results.filter((result) => !result.passed)
  lines.push('', `## Fallos (${failures.length})`, '')
  if (failures.length === 0) lines.push('Ninguno.')
  for (const failure of failures) {
    lines.push(`### ${failure.suite} / ${failure.caseId}${info.repeat > 1 ? ` (ejecución ${failure.run})` : ''}`, '')
    if (failure.error) lines.push(`- **Error:** ${failure.error}`)
    for (const result of failure.checks.filter((candidate) => !candidate.passed)) {
      lines.push(`- ✗ ${result.name}${result.detail ? `: ${result.detail}` : ''}`)
    }
    for (const score of failure.judge?.scores.filter((entry) => entry.score < 4) ?? []) {
      lines.push(`- ✗ juez · ${score.id} = ${score.score}/5: ${score.reason}`)
    }
    if (failure.output) lines.push('', '```text', failure.output.slice(0, 1500), '```')
    lines.push('')
  }
  return lines.join('\n') + '\n'
}

function formatDelta(value: number): string {
  const points = Math.round(value * 100)
  return points === 0 ? '=' : `${points > 0 ? '+' : ''}${points} pts`
}
