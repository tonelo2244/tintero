import type { TinteroApi } from '@shared/ipc'

/**
 * Único punto de acceso a las capacidades nativas (disco, diálogos, menú).
 * Si algún día la suite corre en web o en Tauri, solo cambia este archivo.
 */
export const platform: TinteroApi = window.tintero
