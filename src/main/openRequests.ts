/**
 * Rutas de documento que el sistema operativo pasa a la app al hacer doble clic
 * en un .tdoc/.tpres (Windows y Linux las pasan como argumentos; macOS usa el evento 'open-file').
 *
 * En desarrollo argv es [electron, ".", ...]; empaquetada, [Tintero.exe, ...].
 * No filtramos por extensión: el proceso principal no conoce las apps, y si el archivo
 * no es de Tintero la interfaz ya muestra un aviso claro al intentar abrirlo.
 */
export function documentPathsFromArgv(argv: readonly string[], isPackaged: boolean): string[] {
  return argv.slice(isPackaged ? 1 : 2).filter((arg) => !arg.startsWith('-'))
}

/**
 * Guarda las peticiones de apertura hasta que la interfaz está lista para atenderlas.
 * Sin esta cola, un archivo abierto con doble clic se perdería si llega antes de que React arranque.
 */
export class OpenRequestQueue {
  private pending: string[] = []
  private deliver: ((path: string) => void) | null = null

  request(path: string): void {
    if (this.deliver) this.deliver(path)
    else this.pending.push(path)
  }

  /** La interfaz ya escucha: entrega lo acumulado y, desde ahora, envía directamente. */
  connect(deliver: (path: string) => void): string[] {
    this.deliver = deliver
    const paths = this.pending
    this.pending = []
    return paths
  }

  /** Solo desconecta si `deliver` sigue siendo el receptor actual (otra ventana pudo conectarse después). */
  disconnect(deliver: (path: string) => void): void {
    if (this.deliver === deliver) this.deliver = null
  }
}
