import { describe, expect, it, vi } from 'vitest'
import { documentPathsFromArgv, OpenRequestQueue } from './openRequests'

describe('documentPathsFromArgv', () => {
  it('ignora el ejecutable y las opciones de línea de comandos', () => {
    expect(documentPathsFromArgv(['C:\\Tintero.exe', '--flag', 'C:\\docs\\a.tdoc'], true)).toEqual(['C:\\docs\\a.tdoc'])
  })

  it('en desarrollo también ignora la ruta del proyecto', () => {
    expect(documentPathsFromArgv(['/usr/bin/electron', '.', '/tmp/b.tpres'], false)).toEqual(['/tmp/b.tpres'])
  })
})

describe('OpenRequestQueue', () => {
  it('acumula hasta que la interfaz se conecta y después entrega directamente', () => {
    const queue = new OpenRequestQueue()
    queue.request('/a.tdoc')

    const deliver = vi.fn()
    expect(queue.connect(deliver)).toEqual(['/a.tdoc'])

    queue.request('/b.tdoc')
    expect(deliver).toHaveBeenCalledWith('/b.tdoc')

    queue.disconnect(vi.fn()) // un receptor antiguo no desconecta al actual
    queue.request('/b2.tdoc')
    expect(deliver).toHaveBeenCalledWith('/b2.tdoc')

    queue.disconnect(deliver)
    queue.request('/c.tdoc')
    expect(queue.connect(deliver)).toEqual(['/c.tdoc'])
  })
})
