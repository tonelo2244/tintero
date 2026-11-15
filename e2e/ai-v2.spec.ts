import { createBlank, expect, test } from './support/tintero'
import { startFakeOllama, type FakeOllama } from './support/fakeOllama'

const ANSWER = 'Se aprobó un presupuesto de 18.000 euros para la campaña [1].'

/**
 * IA v2 de punta a punta con el Ollama simulado: fórmulas en lenguaje natural, el agente con
 * herramientas y "Preguntar a mis documentos" (embeddings incluidos). Como en ai-assistant.spec,
 * se prueba la tubería y la revisión antes de aplicar, no la calidad del modelo (eso son las evals).
 */
const aiTest = test.extend<object, { ollama: FakeOllama }>({
  ollama: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const ollama = await startFakeOllama({
        models: ['gemma4:e4b', 'embeddinggemma:latest'],
        // La única salida estructurada de estas pruebas es la fórmula: { formula, explicacion }.
        reply: (request) =>
          request.format ? { formula: 'SUM(A1:A2)', explicacion: 'Suma las dos celdas de encima.' } : ANSWER,
        toolCalls: () => [
          { name: 'add_slide', arguments: { after: 1, title: 'Conclusiones', bullets: ['Lanzamos en junio'] } }
        ]
      })
      await use(ollama)
      await ollama.close()
    },
    { scope: 'worker' }
  ],
  tinteroEnv: async ({ ollama }, use) => use({ TINTERO_OLLAMA_URL: ollama.url })
})

aiTest.describe('IA v2 (con un Ollama simulado)', () => {
  aiTest('Hojas: pedir una fórmula en lenguaje natural, ver el resultado e insertarla', async ({ tintero }) => {
    const { page } = tintero
    await createBlank(page, 'Hojas de cálculo')
    await page.getByRole('grid', { name: 'Hoja Hoja1' }).focus()
    for (const value of ['2', '3']) {
      await page.keyboard.type(value)
      await page.keyboard.press('Enter')
    }

    await page.getByRole('tab', { name: 'Asistente' }).click()
    await page.getByRole('button', { name: 'Fórmula con IA' }).click()
    const panel = page.getByRole('complementary', { name: 'Asistente de hojas de cálculo' })
    await panel.getByLabel(/qué quieres calcular en A3/i).fill('la suma de las dos de arriba')
    await panel.getByRole('button', { name: 'Proponer fórmula' }).click()

    // Se enseña en español y con el resultado calculado ANTES de insertar.
    await expect(panel.getByLabel('Fórmula propuesta')).toHaveText('=SUMA(A1:A2)')
    await expect(panel).toContainText('Resultado en A3: 5')
    await panel.getByRole('button', { name: 'Insertar en A3' }).click()
    await expect(page.getByRole('textbox', { name: 'Contenido de la celda' })).toHaveValue('=SUMA(A1:A2)')
  })

  aiTest(
    'Diapositivas: el agente propone cambios, se aplican y se deshacen de una vez',
    async ({ tintero, ollama }) => {
      const { page } = tintero
      await createBlank(page, 'Diapositivas')
      const status = page.getByRole('contentinfo')
      await expect(status).toContainText('Diapositiva 1 de 1')

      await page.getByRole('tab', { name: 'Asistente' }).click()
      await page.getByRole('button', { name: 'Pedir cambios' }).click()
      const panel = page.getByRole('complementary', { name: 'Asistente de Diapositivas' })
      await panel.getByLabel('¿Qué quieres cambiar?').fill('Añade una diapositiva de conclusiones')
      await panel.getByRole('button', { name: 'Proponer cambios' }).click()

      // Nada cambia hasta pulsar "Aplicar": primero se ve la lista en lenguaje llano.
      await expect(panel.getByRole('list', { name: 'Cambios propuestos' })).toContainText('Conclusiones')
      await expect(status).toContainText('Diapositiva 1 de 1')
      expect(ollama.chatRequests.at(-1)!.tools?.map((tool) => tool.function.name)).toContain('add_slide')

      await panel.getByRole('button', { name: 'Aplicar el cambio' }).click()
      await expect(status).toContainText('de 2')
      await page.getByRole('button', { name: 'Deshacer' }).click()
      await expect(status).toContainText('de 1')
    }
  )

  aiTest('Texto: preguntar a mis documentos responde citando la fuente', async ({ tintero, ollama }) => {
    const { page } = tintero
    await createBlank(page, 'Texto')
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Acta de marzo: se aprueba un presupuesto de 18.000 euros para la campaña de primavera.')

    await page.getByRole('tab', { name: 'Asistente' }).click()
    await page.getByRole('button', { name: 'Preguntar a mis documentos' }).click()
    const panel = page.getByRole('complementary', { name: 'Preguntar a mis documentos' })
    await expect(panel).toContainText('1 documento indexado')

    await panel.getByLabel('¿Qué quieres saber?').fill('¿Qué presupuesto tiene la campaña de primavera?')
    await panel.getByRole('button', { name: 'Preguntar' }).click()

    await expect(panel.getByTestId('ai-answer')).toHaveText(ANSWER)
    await expect(panel.getByRole('list', { name: 'Fuentes' })).toContainText('Documento')
    // El fragmento encontrado viaja al modelo como dato, delimitado y numerado.
    expect(JSON.stringify(ollama.chatRequests.at(-1)!.messages)).toContain('<fragmento n=\\"1\\"')
  })
})
