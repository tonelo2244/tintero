/**
 * Lector incremental de Server-Sent Events, el formato de streaming de la API de OpenAI que usa
 * llama-server: eventos separados por una línea en blanco, cada uno con líneas `data: ...`.
 * Como en NDJSON, un evento puede llegar partido en varias lecturas: se guarda el resto.
 * Devuelve el texto de `data` de cada evento completo (sin interpretar: puede ser "[DONE]").
 */
export class SseDecoder {
  private buffer = ''

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n/g, '\n')
    const events = this.buffer.split('\n\n')
    this.buffer = events.pop() ?? ''
    return events.map(dataOf).filter((data): data is string => data !== null)
  }

  flush(): string[] {
    const rest = this.buffer
    this.buffer = ''
    const data = dataOf(rest)
    return data === null ? [] : [data]
  }
}

function dataOf(event: string): string | null {
  const lines = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
  return lines.length ? lines.join('\n') : null
}
