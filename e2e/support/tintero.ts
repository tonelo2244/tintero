import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

const MAIN_ENTRY = resolve(__dirname, '../../out/main/index.js')

/** Una instancia de Tintero arrancada para una prueba, con su propia carpeta de datos. */
export interface Tintero {
  app: ElectronApplication
  page: Page
  /** Carpeta temporal de la prueba, para guardar y exportar archivos. */
  workDir: string
  /** El próximo diálogo "Guardar" devolverá esta ruta sin mostrarse. */
  answerNextSaveDialog(filePath: string): Promise<void>
  /** El próximo diálogo "Abrir" devolverá esta ruta sin mostrarse. */
  answerNextOpenDialog(filePath: string): Promise<void>
}

interface Options {
  /** Variables de entorno extra para el proceso principal (p. ej. TINTERO_OLLAMA_URL). */
  tinteroEnv: Record<string, string>
}

/**
 * `test` con un Tintero recién arrancado en cada prueba. Cada prueba tiene su carpeta de datos
 * (TINTERO_USER_DATA_DIR) y su carpeta de trabajo, así que no comparten recientes ni archivos
 * y se pueden ejecutar en cualquier orden.
 */
export const test = base.extend<Options & { tintero: Tintero }>({
  tinteroEnv: [{}, { option: true }],

  tintero: async ({ tinteroEnv }, use, testInfo) => {
    const root = await mkdtemp(join(tmpdir(), 'tintero-e2e-'))
    const workDir = join(root, 'archivos')
    await mkdir(workDir)
    const app = await electron.launch({
      // --no-sandbox: los runners de Linux de CI no permiten el sandbox de Chromium.
      args: [MAIN_ENTRY, '--no-sandbox'],
      env: {
        ...(process.env as Record<string, string>),
        TINTERO_USER_DATA_DIR: join(root, 'datos'),
        // Si no se indica otro, un puerto donde no escucha nadie: la prueba no debe depender
        // de que el equipo que la ejecuta tenga Ollama abierto.
        TINTERO_OLLAMA_URL: 'http://127.0.0.1:9',
        ...tinteroEnv
      }
    })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // Los diálogos nativos no se pueden pulsar desde Playwright: se sustituyen, solo para la
    // siguiente llamada, por una función que devuelve la ruta que la prueba quiere.
    const answerNextSaveDialog = (filePath: string) =>
      app.evaluate(({ dialog }, path) => {
        const original = dialog.showSaveDialog
        dialog.showSaveDialog = (async () => {
          dialog.showSaveDialog = original
          return { canceled: false, filePath: path }
        }) as typeof dialog.showSaveDialog
      }, filePath)

    const answerNextOpenDialog = (filePath: string) =>
      app.evaluate(({ dialog }, path) => {
        const original = dialog.showOpenDialog
        dialog.showOpenDialog = (async () => {
          dialog.showOpenDialog = original
          return { canceled: false, filePaths: [path] }
        }) as typeof dialog.showOpenDialog
      }, filePath)

    await use({ app, page, workDir, answerNextSaveDialog, answerNextOpenDialog })

    // Con Electron, Playwright no hace capturas solo: la guardamos en el informe si la prueba falla.
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshot = await page.screenshot().catch(() => null)
      if (screenshot) await testInfo.attach('pantalla al fallar', { body: screenshot, contentType: 'image/png' })
    }

    // Cerrar sin el aviso de "cambios sin guardar": la prueba ya terminó.
    const closed = app.waitForEvent('close')
    await app.evaluate(({ app }) => app.exit(0)).catch(() => {})
    await closed
    await rm(root, { recursive: true, force: true, maxRetries: 5 })
  }
})

export { expect } from '@playwright/test'

/** Desde la pantalla de inicio: elige la app en la barra lateral y crea un documento en blanco. */
export async function createBlank(page: Page, appName: 'Texto' | 'Diapositivas' | 'Hojas de cálculo'): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Aplicaciones' })
    .getByRole('button', { name: appName, exact: true })
    .click()
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await page.getByRole('toolbar').waitFor()
}

/** Ruta a un archivo de e2e/fixtures. */
export function fixture(name: string): string {
  return resolve(__dirname, '../fixtures', name)
}
