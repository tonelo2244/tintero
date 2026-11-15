import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Un Ollama de mentira para los e2e: habla la misma API HTTP (`/api/tags`, `/api/chat` con
 * streaming NDJSON y `/api/embed`) pero responde con textos fijos. Así la prueba es rápida, determinista y
 * no necesita GPU ni descargar un modelo de varios GB en CI.
 *
 * Lo que comprueba el e2e es la tubería (interfaz → IPC → main → HTTP → streaming → interfaz),
 * no la calidad del modelo: eso es trabajo de las evaluaciones de la fase 8.
 */
export interface FakeOllama {
  /** URL para TINTERO_OLLAMA_URL (puerto libre elegido por el sistema). */
  readonly url: string
  /** Cuerpos de las peticiones a /api/chat, para comprobar qué mandó la app. */
  readonly chatRequests: ChatRequestBody[]
  close(): Promise<void>
}

export interface ChatRequestBody {
  model: string
  messages: { role: string; content: string }[]
  format?: unknown
  stream?: boolean
  tools?: { function: { name: string } }[]
}

export interface FakeToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface FakeOllamaOptions {
  models?: string[]
  /** Respuesta para cada petición: texto plano o, si la app pide salida estructurada, un objeto. */
  reply(request: ChatRequestBody): string | object
  /** Si la app ofrece herramientas (`tools`), qué llamadas devuelve el "modelo". */
  toolCalls?(request: ChatRequestBody): FakeToolCall[]
}

export async function startFakeOllama(options: FakeOllamaOptions): Promise<FakeOllama> {
  const models = options.models ?? ['gemma4:e4b']
  const chatRequests: ChatRequestBody[] = []

  const server: Server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ models: models.map((name) => ({ name })) }))
      return
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      const body = JSON.parse(await readBody(req)) as ChatRequestBody
      chatRequests.push(body)
      if (body.tools?.length && options.toolCalls) {
        // Como Ollama: cada llamada a herramienta llega completa, con los argumentos como objeto.
        const calls = options.toolCalls(body).map((call) => ({ function: call }))
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        res.write(
          JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: calls }, done: false }) + '\n'
        )
        res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n')
        return
      }
      const reply = options.reply(body)
      const text = typeof reply === 'string' ? reply : JSON.stringify(reply)

      // Igual que Ollama: una línea JSON por trozo y una última con done: true.
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
      for (const piece of splitIntoChunks(text, 12)) {
        res.write(
          JSON.stringify({ model: body.model, message: { role: 'assistant', content: piece }, done: false }) + '\n'
        )
      }
      res.end(JSON.stringify({ model: body.model, message: { role: 'assistant', content: '' }, done: true }) + '\n')
      return
    }
    if (req.method === 'POST' && req.url === '/api/embed') {
      const body = JSON.parse(await readBody(req)) as { input: string[] }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ embeddings: body.input.map(hashedBagOfWords) }))
      return
    }
    res.writeHead(404).end()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    chatRequests,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function splitIntoChunks(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < text.length; index += size) chunks.push(text.slice(index, index + size))
  return chunks
}

/**
 * Embeddings de juguete pero deterministas: cada palabra suma en una de 64 dimensiones. Textos que
 * comparten palabras quedan cerca, que es todo lo que necesita la prueba de "preguntar".
 */
function hashedBagOfWords(text: string): number[] {
  const vector = new Array<number>(64).fill(0)
  for (const word of text.toLowerCase().match(/[\p{L}\d]{4,}/gu) ?? []) {
    let hash = 0
    for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
    vector[hash % 64] += 1
  }
  return vector
}
