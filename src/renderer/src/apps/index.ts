import { createAppRegistry } from '@/core/appModule'
import { slidesApp } from './slides'
import { writerApp } from './writer'

/**
 * Apps instaladas en la suite. Para añadir una nueva (p. ej. hojas de cálculo):
 *   1. crea `apps/sheets/` con un `index.ts` que exporte un AppModule (ver core/appModule.ts)
 *   2. añádela a esta lista.
 * El inicio, los recientes, abrir/guardar y los atajos funcionarán sin más cambios.
 */
export const installedApps = createAppRegistry([writerApp, slidesApp])
