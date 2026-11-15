import { join } from 'node:path'
import { createBlank, expect, test } from './support/tintero'
import { startFakeOllama, type FakeOllama } from './support/fakeOllama'

const CORRECTED = 'Este es un texto sin faltas.'
const OUTLINE = {
  title: 'Plan de lanzamiento',
  subtitle: 'Resumen para el equipo',
  slides: [
    { title: 'Objetivos', bullets: ['Llegar a 1.000 usuarios', 'Medir la retención'], notes: 'Empezar por el porqué.' },
    { title: 'Calendario', bullets: ['Beta en marzo', 'Versión 1.0 en junio'], notes: 'Fechas orientativas.' }
  ]
}

/**
 * Un Ollama simulado por worker, y cada Tintero de este archivo apuntando a él.
 * Si la app pide salida estructurada (`format` = JSON Schema) es "Crear presentación".
 */
const aiTest = test.extend<object, { ollama: FakeOllama }>({
  ollama: [
    // Playwright lee los parámetros del primer argumento: exige `{}` aunque no use ningún fixture.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const ollama = await startFakeOllama({ reply: (request) => (request.format ? OUTLINE : CORRECTED) })
      await use(ollama)
      await ollama.close()
    },
    { scope: 'worker' }
  ],
  tinteroEnv: async ({ ollama }, use) => use({ TINTERO_OLLAMA_URL: ollama.url })
})

aiTest.describe('Asistente de IA (con un Ollama simulado)', () => {
  aiTest('Corregir la selección y reemplazarla con el resultado', async ({ tintero, ollama }) => {
    const { page } = tintero
    await createBlank(page, 'Texto')
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Esto es un testo con fartas.')
    await page.keyboard.press('ControlOrMeta+A')

    await page.getByRole('tab', { name: 'Asistente' }).click()
    await page.getByRole('button', { name: 'Corregir' }).click()

    const panel = page.getByRole('complementary', { name: 'Asistente de redacción' })
    await expect(panel).toContainText(CORRECTED)
    await expect(panel).toContainText('gemma4:e4b')
    await panel.getByRole('button', { name: 'Reemplazar' }).click()

    await expect(page.locator('.ProseMirror')).toHaveText(CORRECTED)
    // El texto del usuario viaja como datos dentro del prompt, delimitado.
    const lastRequest = ollama.chatRequests.at(-1)!
    expect(lastRequest.model).toBe('gemma4:e4b')
    expect(JSON.stringify(lastRequest.messages)).toContain('Esto es un testo con fartas.')
  })

  aiTest('Crear una presentación desde el documento', async ({ tintero }) => {
    const { page } = tintero
    await createBlank(page, 'Texto')
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Queremos lanzar la app en junio con una beta en marzo.')

    await page.getByRole('tab', { name: 'Asistente' }).click()
    await page.getByRole('button', { name: 'Crear presentación' }).click()

    const panel = page.getByRole('complementary', { name: 'Crear presentación' })
    await expect(panel).toContainText('portada y 2 diapositivas')
    // El documento tiene cambios: Tintero lo guarda antes de abrir la presentación nueva.
    await tintero.answerNextSaveDialog(join(tintero.workDir, 'Lanzamiento.tdoc'))
    await panel.getByRole('button', { name: /abrir en Diapositivas/i }).click()

    await expect(page.getByRole('contentinfo')).toContainText('Diapositiva 1 de 3')
    await expect(page.getByText('Plan de lanzamiento').first()).toBeVisible()
  })
})

test('sin Ollama, el asistente explica cómo ponerlo en marcha', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  await page.getByRole('tab', { name: 'Asistente' }).click()
  await page.getByRole('button', { name: 'Resumir' }).click()

  const notice = page.getByRole('complementary', { name: 'Asistente de redacción' }).getByRole('status')
  await expect(notice).toContainText('ollama pull gemma4:e4b')
  await expect(notice.getByRole('button', { name: 'Comprobar de nuevo' })).toBeVisible()
})
