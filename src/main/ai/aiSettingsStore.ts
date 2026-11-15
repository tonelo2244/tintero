import { promises as fs } from 'node:fs'
import { writeFileAtomic } from '../fileService'

export interface AiSettings {
  /** Modelo elegido por el usuario, o null para que Tintero elija uno de los instalados. */
  model: string | null
}

const DEFAULTS: AiSettings = { model: null }

/** Preferencias de la IA en userData/ai-settings.json. Mismo patrón que RecentsStore. */
export class AiSettingsStore {
  private cache: AiSettings | null = null

  constructor(private readonly storePath: string) {}

  async get(): Promise<AiSettings> {
    if (this.cache) return this.cache
    try {
      const parsed = JSON.parse(await fs.readFile(this.storePath, 'utf8')) as Partial<AiSettings>
      this.cache = { model: typeof parsed.model === 'string' ? parsed.model : null }
    } catch {
      this.cache = { ...DEFAULTS }
    }
    return this.cache
  }

  async update(changes: Partial<AiSettings>): Promise<AiSettings> {
    const next = { ...(await this.get()), ...changes }
    this.cache = next
    await writeFileAtomic(this.storePath, JSON.stringify(next, null, 2))
    return next
  }
}
