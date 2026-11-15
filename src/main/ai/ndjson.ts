/**
 * Lector incremental de NDJSON (un objeto JSON por línea), el formato en el que Ollama
 * envía la respuesta en streaming.
 *
 * Los trozos que llegan por la red no respetan los saltos de línea: un objeto puede venir
 * partido en dos lecturas, o varias líneas en una sola. Por eso se guarda el resto incompleto
 * hasta que llega el siguiente trozo.
 */
export class NdjsonDecoder {
  private buffer = ''

  /** Añade texto recibido y devuelve los objetos completos que ya se pueden leer. */
  push(chunk: string): unknown[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    return lines.filter((line) => line.trim() !== '').map(parseLine)
  }

  /** Al cerrar el stream: lo que quede debe ser una última línea completa (sin salto final). */
  flush(): unknown[] {
    const rest = this.buffer.trim()
    this.buffer = ''
    return rest ? [parseLine(rest)] : []
  }
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    throw new Error(`Respuesta del modelo con formato inesperado: ${line.slice(0, 80)}`)
  }
}
