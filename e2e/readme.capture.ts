import { join, resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { startFakeOllama, type FakeOllama } from './support/fakeOllama'
import { test } from './support/tintero'

/**
 * No es una prueba: regenera las capturas del README con `npm run capturas`.
 * Usa la app real y el mismo Ollama simulado que los e2e, así las capturas no dependen
 * de tener un modelo descargado y salen iguales en cualquier equipo.
 */
const OUT_DIR = resolve(__dirname, '../docs/capturas')

const IMPROVED =
  'La reunión del lunes sirvió para cerrar el calendario del lanzamiento: la beta saldrá en marzo y la versión 1.0, en junio. Antes, el equipo revisará los comentarios de los primeros usuarios.'
const OUTLINE = {
  title: 'Lanzamiento de la versión 1.0',
  subtitle: 'Resumen de la reunión del lunes',
  slides: [
    { title: 'Calendario', bullets: ['Beta en marzo', 'Versión 1.0 en junio'], notes: 'Fechas acordadas.' },
    { title: 'Antes de la beta', bullets: ['Revisar comentarios', 'Cerrar errores graves'], notes: '' },
    { title: 'Próximos pasos', bullets: ['Repartir tareas', 'Reunión de seguimiento'], notes: '' }
  ]
}

const captureTest = test.extend<object, { ollama: FakeOllama }>({
  ollama: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const ollama = await startFakeOllama({ reply: (request) => (request.format ? OUTLINE : IMPROVED) })
      await use(ollama)
      await ollama.close()
    },
    { scope: 'worker' }
  ],
  tinteroEnv: async ({ ollama }, use) => use({ TINTERO_OLLAMA_URL: ollama.url })
})

async function snap(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(400) // que terminen las transiciones de la interfaz
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) })
}

async function fromTemplate(page: Page, appName: string, template: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Aplicaciones' })
    .getByRole('button', { name: appName, exact: true })
    .click()
  await page.locator('.gallery__item', { hasText: template }).dblclick()
  await page.getByRole('toolbar').waitFor()
}

captureTest('capturas del README', async ({ tintero }) => {
  const { app, page } = tintero
  // Tamaño fijo para que las capturas no cambien de una ejecución a otra.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 800))

  await page.getByRole('navigation', { name: 'Aplicaciones' }).getByRole('button', { name: 'Diapositivas' }).click()
  await snap(page, 'inicio')

  await fromTemplate(page, 'Texto', 'Bienvenido a Tintero')
  await snap(page, 'texto')
  await page.getByRole('button', { name: 'Inicio', exact: true }).click()

  await fromTemplate(page, 'Diapositivas', 'Le damos la bienvenida')
  await snap(page, 'diapositivas')
  await page.getByRole('button', { name: 'Inicio', exact: true }).click()

  await fromTemplate(page, 'Hojas de cálculo', 'Presupuesto mensual')
  await snap(page, 'hojas')
  await page.getByRole('button', { name: 'Inicio', exact: true }).click()

  await page
    .getByRole('navigation', { name: 'Aplicaciones' })
    .getByRole('button', { name: 'Texto', exact: true })
    .click()
  await page.getByRole('button', { name: 'Crear', exact: true }).click()
  await page.locator('.ProseMirror').click()
  await page.keyboard.type(
    'En la reunion del lunes se hablo del calendario del lanzamiento y se dijo que la beta sale en marzo y la 1.0 en junio y que antes hay que mirar los comentarios de los primeros usuarios.'
  )
  await page.keyboard.press('ControlOrMeta+A')
  await page.getByRole('tab', { name: 'Asistente' }).click()
  await page.getByRole('button', { name: 'Mejorar redacción' }).click()
  await page.getByRole('complementary', { name: 'Asistente de redacción' }).getByText('Insertar debajo').waitFor()
  await snap(page, 'ia-asistente')
  await page
    .getByRole('complementary', { name: 'Asistente de redacción' })
    .getByRole('button', { name: 'Cerrar' })
    .click()

  await page.getByRole('button', { name: 'Crear presentación' }).click()
  await page.getByRole('complementary', { name: 'Crear presentación' }).getByText('portada y 3 diapositivas').waitFor()
  await snap(page, 'ia-presentacion')
})
