import { describe, expect, it, vi } from 'vitest'
import { WindowCloseGuard, type CloseChoice } from './closeGuard'

function createGuard(choice: CloseChoice) {
  const deps = {
    askUser: vi.fn(async () => choice),
    requestSave: vi.fn(),
    close: vi.fn(),
    onCancel: vi.fn(),
    onDiscard: vi.fn()
  }
  return { guard: new WindowCloseGuard(deps), deps }
}

const informe = { name: 'Informe', recoveryId: 'doc_1' }
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('WindowCloseGuard', () => {
  it('deja cerrar sin preguntar si no hay cambios', () => {
    const { guard, deps } = createGuard('cancel')
    expect(guard.handleCloseAttempt()).toBe(true)
    expect(deps.askUser).not.toHaveBeenCalled()
  })

  it('bloquea el cierre y pregunta si hay cambios sin guardar', () => {
    const { guard, deps } = createGuard('cancel')
    guard.setDirtyDocument(informe)
    expect(guard.handleCloseAttempt()).toBe(false)
    expect(deps.askUser).toHaveBeenCalledWith('Informe')
  })

  it('"No guardar" cierra la ventana y deja pasar el siguiente cierre', async () => {
    const { guard, deps } = createGuard('discard')
    guard.setDirtyDocument(informe)
    guard.handleCloseAttempt()
    await flushPromises()
    expect(deps.close).toHaveBeenCalledOnce()
    expect(deps.onDiscard).toHaveBeenCalledWith(informe)
    expect(guard.handleCloseAttempt()).toBe(true)
  })

  it('"Guardar" pide guardar y solo cierra cuando se confirma', async () => {
    const { guard, deps } = createGuard('save')
    guard.setDirtyDocument(informe)
    guard.handleCloseAttempt()
    await flushPromises()
    expect(deps.requestSave).toHaveBeenCalledOnce()
    expect(deps.close).not.toHaveBeenCalled()

    guard.confirmSaved()
    expect(deps.close).toHaveBeenCalledOnce()
  })

  it('"Cancelar" mantiene la ventana abierta y avisa', async () => {
    const { guard, deps } = createGuard('cancel')
    guard.setDirtyDocument(informe)
    guard.handleCloseAttempt()
    await flushPromises()
    expect(deps.close).not.toHaveBeenCalled()
    expect(deps.onCancel).toHaveBeenCalledOnce()
  })

  it('no abre dos diálogos si se intenta cerrar varias veces seguidas', () => {
    const { guard, deps } = createGuard('cancel')
    guard.setDirtyDocument(informe)
    guard.handleCloseAttempt()
    guard.handleCloseAttempt()
    expect(deps.askUser).toHaveBeenCalledOnce()
  })
})
