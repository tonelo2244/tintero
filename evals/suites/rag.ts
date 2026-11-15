import type { JSONContent } from '@tiptap/core'
import { answerFromDocuments, NOT_FOUND_ANSWER } from '@/apps/writer/model/ai/askDocuments'
import { contentFingerprint, documentChunks } from '@/apps/writer/model/ai/documentChunks'
import corpus from '../cases/rag-corpus.json'
import ragCases from '../cases/rag.json'
import { check, containsAll } from '../lib/checks'
import { defineSuite, type CheckResult, type EvalCase, type EvalContext } from '../lib/types'

type CorpusBlock = string | { heading: string }

interface RagCase extends EvalCase {
  question: string
  /** Documento y trozo de texto que la búsqueda debe encontrar entre los 5 primeros. */
  expectedSource?: string
  expectedSnippet?: string
  mustContain?: string[]
  /** La respuesta no está en el corpus: hay que decir "no lo encuentro". */
  notFound?: boolean
}

/** El corpus en el mismo formato que guarda Texto, para trocearlo con el código de la app. */
export function corpusDocument(blocks: CorpusBlock[]): JSONContent {
  return {
    type: 'doc',
    content: blocks.map((block) =>
      typeof block === 'string'
        ? { type: 'paragraph', content: [{ type: 'text', text: block }] }
        : { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: block.heading }] }
    )
  }
}

/** Indexar es idempotente (huella): solo el primer caso paga el cálculo de los vectores. */
async function indexCorpus(context: EvalContext) {
  for (const document of corpus.documents) {
    const doc = corpusDocument(document.blocks as CorpusBlock[])
    await context.rag.index({
      id: document.id,
      title: document.title,
      fingerprint: contentFingerprint(JSON.stringify(doc)),
      chunks: documentChunks(doc)
    })
  }
}

/**
 * RAG se evalúa en dos mitades, porque fallan por motivos distintos y se arreglan en sitios distintos:
 *  - Recuperación (¿encontró el párrafo?): depende del troceado y del modelo de embeddings.
 *    Se mide con recall@5 y la posición del fragmento correcto (de ahí sale el MRR del informe).
 *  - Generación (¿respondió bien con lo encontrado?): depende del prompt y del modelo de chat.
 * Si falla la primera, mirar la segunda no sirve de nada.
 */
export const ragSuite = defineSuite<RagCase>({
  id: 'preguntar',
  description: 'Preguntar a tus documentos: recuperar el párrafo, responder y citarlo',
  structured: false,
  cases: ragCases as RagCase[],
  async run(testCase, context) {
    await indexCorpus(context)
    const { sources, answer } = await answerFromDocuments(context.ai, context.rag, testCase.question)
    const checks: CheckResult[] = []

    if (testCase.notFound) {
      const saysNotFound = answer.text.toLowerCase().includes(NOT_FOUND_ANSWER.toLowerCase().replace(/\.$/, ''))
      checks.push(check('dice que no lo encuentra', saysNotFound, saysNotFound ? undefined : answer.text.slice(0, 120)))
      return { output: answer.text, checks }
    }

    const rank =
      sources.findIndex(
        (source) => source.sourceId === testCase.expectedSource && source.text.includes(testCase.expectedSnippet ?? '')
      ) + 1
    checks.push(
      check(
        'recupera el párrafo (recall@5)',
        rank > 0,
        rank > 0
          ? `posición ${rank} (RR ${(1 / rank).toFixed(2)})`
          : `no está; encontró: ${sources.map((source) => source.location).join(' | ') || 'nada'}`
      )
    )
    if (testCase.mustContain) checks.push(containsAll(answer.text, testCase.mustContain))
    checks.push(check('cita alguna fuente', answer.cited.length > 0))
    if (rank > 0) {
      checks.push(
        check('cita el párrafo correcto', answer.cited.includes(rank), `citó ${answer.cited.join(', ') || 'nada'}`)
      )
    }
    checks.push(
      check(
        'sin citas inventadas',
        answer.invalid.length === 0,
        answer.invalid.length ? `[${answer.invalid}]` : undefined
      )
    )
    return { output: answer.text, checks }
  }
})
