import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { RecoverySnapshot } from '@shared/ipc'
import { writeFileAtomic } from './fileService'

/** Los ids vienen del renderer: solo aceptamos caracteres seguros para no salir de la carpeta. */
const SAFE_ID = /^[\w-]{1,64}$/

function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) throw new Error(`Id de recuperación no válido: "${id}"`)
}

function isSnapshot(value: unknown): value is RecoverySnapshot {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.appId === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.path === null || typeof candidate.path === 'string') &&
    typeof candidate.savedAt === 'string' &&
    typeof candidate.contents === 'string'
  )
}

/**
 * Una copia merece recuperarse si el documento nunca se guardó o si la copia
 * es más nueva que el archivo en disco. Si el archivo es más nuevo, la copia ya no aporta nada.
 */
export function isSnapshotWorthRecovering(snapshot: RecoverySnapshot, fileModifiedAt: Date | null): boolean {
  if (snapshot.path === null || fileModifiedAt === null) return true
  return new Date(snapshot.savedAt).getTime() > fileModifiedAt.getTime()
}

/**
 * Copias de seguridad de los documentos abiertos, en userData/recovery/<id>.json.
 * Igual que RecentsStore, no depende de Electron para poder probarse con una carpeta temporal.
 */
export class RecoveryStore {
  constructor(private readonly directory: string) {}

  async save(snapshot: RecoverySnapshot): Promise<void> {
    assertSafeId(snapshot.id)
    await writeFileAtomic(this.fileFor(snapshot.id), JSON.stringify(snapshot))
  }

  async discard(id: string): Promise<void> {
    assertSafeId(id)
    await fs.rm(this.fileFor(id), { force: true })
  }

  /** Devuelve las copias que vale la pena ofrecer y borra las que ya no sirven. */
  async listRecoverable(): Promise<RecoverySnapshot[]> {
    const recoverable: RecoverySnapshot[] = []
    for (const fileName of await this.snapshotFileNames()) {
      const filePath = join(this.directory, fileName)
      const snapshot = await this.readSnapshot(filePath)
      if (snapshot && isSnapshotWorthRecovering(snapshot, await modifiedAt(snapshot.path))) {
        recoverable.push(snapshot)
      } else {
        await fs.rm(filePath, { force: true })
      }
    }
    return recoverable.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }

  private fileFor(id: string): string {
    return join(this.directory, `${id}.json`)
  }

  private async snapshotFileNames(): Promise<string[]> {
    try {
      const names = await fs.readdir(this.directory)
      // Ignora los temporales de la escritura atómica (".<nombre>.<pid>.tmp").
      return names.filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    } catch {
      return [] // la carpeta aún no existe: nunca se hizo ninguna copia
    }
  }

  private async readSnapshot(filePath: string): Promise<RecoverySnapshot | null> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'))
      return isSnapshot(parsed) ? parsed : null
    } catch {
      return null // copia dañada (p. ej. un corte de luz a mitad): se descarta
    }
  }
}

async function modifiedAt(path: string | null): Promise<Date | null> {
  if (!path) return null
  try {
    return (await fs.stat(path)).mtime
  } catch {
    return null // el archivo original ya no existe: la copia es lo único que queda
  }
}
