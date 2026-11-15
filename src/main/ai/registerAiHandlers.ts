import { ipcMain } from 'electron'
import { AiChannel, type AiGenerateRequest, type RagSourceInput } from '@shared/ai'
import type { AiService } from './aiService'
import type { RagService } from './rag/ragService'

/**
 * Capa fina entre IPC y AiService. El streaming va como eventos `ai:token` etiquetados con el id
 * de la petición: `invoke` solo devuelve un valor al final, y queremos ver el texto según se escribe.
 */
export function registerAiHandlers(ai: AiService, rag: RagService): void {
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

  ipcMain.handle(AiChannel.RagStatus, () => rag.status())
  ipcMain.handle(AiChannel.RagIndex, (_event, source: RagSourceInput) => rag.index(source))
  ipcMain.handle(AiChannel.RagRemove, (_event, sourceId: string) => rag.remove(sourceId))
  ipcMain.handle(AiChannel.RagSearch, (_event, query: string, limit: number) => rag.search(query, limit))
}
