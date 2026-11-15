import { useCallback, useEffect, useState } from 'react'
import type { AiStatus } from '@shared/ai'
import { platform } from '@/core/platform'

/**
 * Estado del runtime local (¿Ollama está abierto? ¿qué modelos hay?). Se consulta al montar y
 * cuando la interfaz lo pide (p. ej. el usuario acaba de abrir Ollama y pulsa "Comprobar").
 */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await platform.ai.status()
      setStatus(next)
      return next
    } catch {
      const next: AiStatus = { state: 'unreachable', endpoint: '' }
      setStatus(next)
      return next
    }
  }, [])

  const setModel = useCallback(async (model: string) => setStatus(await platform.ai.setModel(model)), [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { status, refresh, setModel }
}
