import { ipcMain } from 'electron'
import { AiChannel, type AiGenerateRequest } from '@shared/ai'
import type { AiService } from './aiService'

/**
 * Capa fina entre IPC y AiService. El streaming va como eventos `ai:token` etiquetados con el id
 * de la petición: `invoke` solo devuelve un valor al final, y queremos ver el texto según se escribe.
 */
export function registerAiHandlers(ai: AiService): void {
  ipcMain.handle(AiChannel.Status, () => ai.status())
  ipcMain.handle(AiChannel.SetModel, (_event, model: string) => ai.setModel(model))

  ipcMain.handle(AiChannel.Generate, (event, requestId: string, request: AiGenerateRequest) => {
    const sender = event.sender
    sender.once('destroyed', () => ai.cancel(requestId))
    return ai.generate(requestId, request, (chunk) => {
      if (!sender.isDestroyed()) sender.send(AiChannel.Token, requestId, chunk)
    })
  })

  ipcMain.on(AiChannel.Cancel, (_event, requestId: string) => ai.cancel(requestId))
}
