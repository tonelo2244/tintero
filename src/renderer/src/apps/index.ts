import { createAppRegistry } from '@/core/appModule'
import { sheetsApp } from './sheets'
import { slidesApp } from './slides'
import { writerApp } from './writer'

/**
 * Apps instaladas en la suite. Para añadir una nueva:
 *   1. crea `apps/sheets/` con un `index.ts` que exporte un AppModule (ver core/appModule.ts)
 *   2. añádela a esta lista.
 * El inicio, los recientes, abrir/guardar y los atajos funcionarán sin más cambios.
 */
export const installedApps = createAppRegistry([writerApp, slidesApp, sheetsApp])
