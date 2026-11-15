/** Dirección por defecto de Ollama en el propio equipo. */
export const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])

/**
 * Tintero promete que nada sale de tu equipo. Esta función es la que lo hace cumplir en la IA:
 * solo acepta direcciones del propio ordenador (loopback), aunque alguien configure otra.
 * Así un cambio futuro (o una variable de entorno mal puesta) no puede mandar tus documentos fuera.
 */
export function assertLocalEndpoint(endpoint: string): string {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error(`Dirección del modelo no válida: ${endpoint}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Protocolo no permitido para el modelo: ${url.protocol}`)
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`Tintero solo usa modelos de este equipo; "${url.hostname}" no es una dirección local.`)
  }
  return url.origin
}
