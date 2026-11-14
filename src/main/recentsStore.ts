import { promises as fs } from 'node:fs'
import type { RecentFile } from '@shared/ipc'
import { writeFileAtomic } from './fileService'

const MAX_RECENTS = 50

/**
 * Persiste la lista de archivos recientes en un JSON dentro de la carpeta
 * de datos del usuario (userData). No depende de Electron para poder probarse.
 */
export class RecentsStore {
  private cache: RecentFile[] | null = null

  constructor(private readonly storePath: string) {}

  async list(): Promise<RecentFile[]> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(this.storePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      this.cache = Array.isArray(parsed) ? (parsed as RecentFile[]) : []
    } catch {
      // Primer arranque o archivo dañado: empezamos con la lista vacía.
      this.cache = []
    }
    return this.cache
  }

  async touch(entry: Pick<RecentFile, 'path' | 'name' | 'appId'>): Promise<RecentFile[]> {
    const current = await this.list()
    const previous = current.find((item) => item.path === entry.path)
    const updated: RecentFile = {
      ...entry,
      pinned: previous?.pinned ?? false,
      lastOpenedAt: new Date().toISOString()
    }
    const others = current.filter((item) => item.path !== entry.path)
    return this.persist([updated, ...others].slice(0, MAX_RECENTS))
  }

  async setPinned(path: string, pinned: boolean): Promise<RecentFile[]> {
    const current = await this.list()
    return this.persist(current.map((item) => (item.path === path ? { ...item, pinned } : item)))
  }

  async remove(path: string): Promise<RecentFile[]> {
    const current = await this.list()
    return this.persist(current.filter((item) => item.path !== path))
  }

  private async persist(items: RecentFile[]): Promise<RecentFile[]> {
    this.cache = items
    await writeFileAtomic(this.storePath, JSON.stringify(items, null, 2))
    return items
  }
}
