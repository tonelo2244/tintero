import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureExtension, writeFileAtomic } from './fileService'
import { RecentsStore } from './recentsStore'

describe('fileService', () => {
  it('añade la extensión cuando falta', () => {
    expect(ensureExtension('/tmp/informe', ['tdoc'])).toBe('/tmp/informe.tdoc')
    expect(ensureExtension('/tmp/informe.TDOC', ['tdoc'])).toBe('/tmp/informe.TDOC')
  })

  it('escribe de forma atómica sin dejar temporales', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tintero-'))
    const target = join(dir, 'sub', 'doc.tdoc')
    await writeFileAtomic(target, 'hola')
    expect(await readFile(target, 'utf8')).toBe('hola')
    expect(await readdir(join(dir, 'sub'))).toEqual(['doc.tdoc'])
  })
})

describe('RecentsStore', () => {
  it('ordena por uso, conserva el anclado y persiste en disco', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tintero-'))
    const storePath = join(dir, 'recents.json')
    const store = new RecentsStore(storePath)

    await store.touch({ path: '/a.tdoc', name: 'a', appId: 'writer' })
    await store.touch({ path: '/b.tdoc', name: 'b', appId: 'writer' })
    await store.setPinned('/a.tdoc', true)
    const list = await store.touch({ path: '/a.tdoc', name: 'a', appId: 'writer' })

    expect(list.map((item) => item.path)).toEqual(['/a.tdoc', '/b.tdoc'])
    expect(list[0].pinned).toBe(true)

    const reloaded = await new RecentsStore(storePath).list()
    expect(reloaded).toHaveLength(2)
  })
})
