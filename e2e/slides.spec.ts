import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createBlank, expect, test } from './support/tintero'

test('Diapositivas: escribir el título, añadir una diapositiva y guardar', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Diapositivas')

  // Como en PowerPoint: doble clic en el marcador de posición para escribir en él.
  await page.getByText('Haga clic para agregar título').dblclick()
  await page.keyboard.type('Plan del trimestre')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Nueva diapositiva' }).click()
  await page.getByRole('button', { name: 'Título y contenido' }).click()
  await expect(page.getByRole('contentinfo')).toContainText('Diapositiva 2 de 2')

  const filePath = join(tintero.workDir, 'Plan.tpres')
  await tintero.answerNextSaveDialog(filePath)
  await page.getByRole('button', { name: 'Guardar (Ctrl/Cmd+S)' }).click()

  await expect.poll(() => readFile(filePath, 'utf8').catch(() => '')).toContain('Plan del trimestre')
  const saved = JSON.parse(await readFile(filePath, 'utf8'))
  expect(saved.appId).toBe('slides')
  expect(saved.content.slides).toHaveLength(2)
})
