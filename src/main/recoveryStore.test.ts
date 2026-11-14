import { mkdtemp, readdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RecoverySnapshot } from '@shared/ipc'
import { isSnapshotWorthRecovering, RecoveryStore } from './recoveryStore'

function snapshot(overrides: Partial<RecoverySnapshot> = {}): RecoverySnapshot {
  return {
    id: 'doc_1',
    appId: 'writer',
    name: 'Informe',
    path: null,
    savedAt: '2026-01-01T10:00:00.000Z',
    contents: '{}',
    ...overrides
  }
}

describe('isSnapshotWorthRecovering', () => {
  it('ofrece siempre un documento que nunca se guardó', () => {
    expect(isSnapshotWorthRecovering(snapshot(), null)).toBe(true)
  })

  it('compara la copia con la fecha del archivo', () => {
    const copy = snapshot({ path: '/docs/informe.tdoc' })
    expect(isSnapshotWorthRecovering(copy, new Date('2026-01-01T09:00:00Z'))).toBe(true)
    expect(isSnapshotWorthRecovering(copy, new Date('2026-01-01T11:00:00Z'))).toBe(false)
  })
})

describe('RecoveryStore', () => {
  it('guarda, lista y descarta copias', async () => {
    const store = new RecoveryStore(await mkdtemp(join(tmpdir(), 'tintero-recovery-')))
    await store.save(snapshot({ id: 'doc_a', savedAt: '2026-01-01T10:00:00.000Z' }))
    await store.save(snapshot({ id: 'doc_b', savedAt: '2026-01-02T10:00:00.000Z' }))

    expect((await store.listRecoverable()).map((item) => item.id)).toEqual(['doc_b', 'doc_a'])

    await store.discard('doc_a')
    expect((await store.listRecoverable()).map((item) => item.id)).toEqual(['doc_b'])
  })

  it('borra las copias más antiguas que el archivo guardado y las dañadas', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tintero-recovery-'))
    const original = join(dir, 'informe.tdoc')
    await writeFile(original, '{}')
    await utimes(original, new Date('2026-01-03T00:00:00Z'), new Date('2026-01-03T00:00:00Z'))

    const store = new RecoveryStore(dir)
    await store.save(snapshot({ id: 'doc_old', path: original, savedAt: '2026-01-01T10:00:00.000Z' }))
    await writeFile(join(dir, 'doc_broken.json'), '{ esto no es JSON')

    expect(await store.listRecoverable()).toEqual([])
    expect(await readdir(dir)).toEqual(['informe.tdoc'])
  })

  it('no acepta ids que intenten salir de la carpeta', async () => {
    const store = new RecoveryStore(await mkdtemp(join(tmpdir(), 'tintero-recovery-')))
    await expect(store.save(snapshot({ id: '../fuera' }))).rejects.toThrow()
  })

  it('devuelve una lista vacía si la carpeta todavía no existe', async () => {
    const store = new RecoveryStore(join(tmpdir(), 'tintero-no-existe', String(Date.now())))
    expect(await store.listRecoverable()).toEqual([])
  })
})
