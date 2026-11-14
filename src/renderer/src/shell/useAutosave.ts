import { useEffect, useRef } from 'react'
import type { RecoverySnapshot } from '@shared/ipc'
import { platform } from '@/core/platform'

export const AUTOSAVE_INTERVAL_MS = 30_000

export interface PendingSnapshot {
  /** Número de cambios del documento cuando se tomó la copia. */
  revision: number
  snapshot: RecoverySnapshot
}

/** Solo escribimos si el documento cambió desde la última copia (evita escrituras inútiles). */
export function snapshotKey(pending: PendingSnapshot): string {
  return `${pending.snapshot.id}#${pending.revision}`
}

/**
 * Cada `intervalMs`, guarda una copia del documento en userData/recovery si hay cambios nuevos.
 * Es una red de seguridad ante cierres inesperados, no sustituye a "Guardar".
 */
export function useAutosave(takeSnapshot: () => PendingSnapshot | null, intervalMs = AUTOSAVE_INTERVAL_MS): void {
  // Guardamos la función en una ref para no reiniciar el temporizador en cada render.
  const takeSnapshotRef = useRef(takeSnapshot)
  const lastWrittenKey = useRef<string | null>(null)

  useEffect(() => {
    takeSnapshotRef.current = takeSnapshot
  }, [takeSnapshot])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const pending = takeSnapshotRef.current()
      if (!pending) return
      const key = snapshotKey(pending)
      if (key === lastWrittenKey.current) return
      try {
        await platform.recovery.save(pending.snapshot)
        lastWrittenKey.current = key
      } catch {
        // Si el disco falla, lo reintentamos en la siguiente vuelta; no molestamos al usuario.
      }
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
}
