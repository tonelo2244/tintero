/**
 * Banco de evaluación de la IA de Tintero.
 *
 *   npm run eval -- --model gemma4:e4b
 *   npm run eval -- --model qwen3.5:9b --suite formulas,corregir --repeat 3
 *   npm run eval -- --model gemma4:e4b --baseline evals/results/2026-11-15T10-00-gemma4_e4b.json
 *   npm run eval -- --runtime llamacpp --url http://127.0.0.1:8080 --model local
 *
 * No va en CI: necesita un modelo de verdad. Se ejecuta a mano antes y después de cambiar un
 * prompt o de modelo, y se comparan los informes. Ver evals/README.md.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_OLLAMA_ENDPOINT } from '../src/main/ai/localEndpoint'
import { OllamaClient, type LocalModelRuntime } from '../src/main/ai/ollamaClient'
import { renderMarkdown, type EvalReport } from './lib/report'
import { runEvals } from './lib/runner'
import { SUITES } from './suites'

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'gemma4:e4b' },
    'judge-model': { type: 'string' },
    runtime: { type: 'string', default: 'ollama' },
    url: { type: 'string' },
    suite: { type: 'string' },
    case: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    baseline: { type: 'string' },
    out: { type: 'string', default: join(import.meta.dirname, 'results') },
    list: { type: 'boolean', default: false }
  }
})

function createRuntime(kind: string, url: string | undefined): LocalModelRuntime {
  if (kind === 'ollama') return new OllamaClient(url ?? process.env.TINTERO_OLLAMA_URL ?? DEFAULT_OLLAMA_ENDPOINT)
  throw new Error(`Runtime desconocido: ${kind}. Usa "ollama".`)
}

function gitCommit(): string | null {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
    return dirty ? `${sha} (con cambios sin commit)` : sha
  } catch {
    return null
  }
}

const list = (value: string | undefined) =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []

async function main() {
  if (values.list) {
    for (const suite of SUITES) console.log(`${suite.id.padEnd(14)} ${suite.cases.length} casos · ${suite.description}`)
    return
  }
  const suiteIds = list(values.suite)
  const unknown = suiteIds.filter((id) => !SUITES.some((suite) => suite.id === id))
  if (unknown.length) throw new Error(`Suites desconocidas: ${unknown.join(', ')}. Mira las que hay con --list.`)
  const suites = suiteIds.length ? SUITES.filter((suite) => suiteIds.includes(suite.id)) : SUITES

  const model = values.model!
  const judgeModel = values['judge-model'] ?? model
  const runtime = createRuntime(values.runtime!, values.url)
  const installed = await runtime.listModels(AbortSignal.timeout(5000))
  for (const needed of new Set([model, judgeModel])) {
    if (!installed.some((name) => name === needed || name === `${needed}:latest`)) {
      throw new Error(
        `El modelo ${needed} no está en ${runtime.endpoint}. Instalados: ${installed.join(', ') || 'ninguno'}`
      )
    }
  }

  const startedAt = new Date().toISOString()
  console.log(`Evaluando ${model} (juez: ${judgeModel}) en ${runtime.endpoint}\n`)
  const report = await runEvals({
    runtime,
    model,
    judgeModel,
    suites,
    caseIds: list(values.case),
    repeat: Math.max(1, Number(values.repeat) || 1),
    info: { runtime: values.runtime!, startedAt, commit: gitCommit() },
    onResult: (result) => {
      const mark = result.passed ? '✓' : '✗'
      const why =
        result.error ??
        result.checks
          .filter((check) => !check.passed)
          .map((check) => check.name)
          .join('; ')
      console.log(
        `${mark} ${result.suite}/${result.caseId}  ${(result.latencyMs / 1000).toFixed(1)} s${why ? `  · ${why}` : ''}`
      )
    }
  })

  const baseline = values.baseline
    ? (JSON.parse(readFileSync(resolve(values.baseline), 'utf8')) as EvalReport)
    : undefined
  const markdown = renderMarkdown(report, baseline)
  mkdirSync(values.out!, { recursive: true })
  const name = `${startedAt.slice(0, 16).replace(/:/g, '-')}-${model.replace(/[^\w.-]+/g, '_')}`
  writeFileSync(join(values.out!, `${name}.json`), JSON.stringify(report, null, 2))
  writeFileSync(join(values.out!, `${name}.md`), markdown)

  console.log(`\n${markdown.split('\n## Fallos')[0]}`)
  console.log(`Informe: ${join(values.out!, `${name}.md`)}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
