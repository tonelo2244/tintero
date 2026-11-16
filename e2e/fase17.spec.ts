import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createBlank, expect, test, type Tintero } from './support/tintero'

const SHOTS = process.env.FASE17_SHOTS

/** Exporta a PDF y devuelve el texto de cada hoja (pdftotext, como en la fase 15). */
async function exportPdfPages(tintero: Tintero, name: string): Promise<string[]> {
  const { page } = tintero
  const pdfPath = join(tintero.workDir, name)
  await tintero.answerNextSaveDialog(pdfPath)
  await page.getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('menuitem', { name: 'PDF (.pdf)' }).click()
  await expect
    .poll(() =>
      readFile(pdfPath).then(
        (bytes) => bytes.length,
        () => 0
      )
    )
    .toBeGreaterThan(0)
  if (SHOTS) execFileSync('pdftoppm', ['-png', '-r', '50', pdfPath, join(SHOTS, name.replace('.pdf', ''))])
  return execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString('utf8').split('\f')
}

/** Fase 17: tabla de contenido, notas al pie y al final, títulos, referencias cruzadas y citas. */
test('Texto: notas al pie en su hoja, notas al final y tabla de contenido', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  // "# " y "## " al empezar un párrafo lo hacen título, como en Markdown.
  await page.keyboard.type('# ')
  await page.keyboard.insertText('Introducción')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Un texto con una nota.')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Y otra al final.')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+Enter')
  await page.keyboard.type('# ')
  await page.keyboard.insertText('Desarrollo')
  await page.keyboard.press('Enter')
  await page.keyboard.type('## ')
  await page.keyboard.insertText('Detalles')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Texto del desarrollo.')

  /** Lleva el cursor al final (o al principio) de un párrafo y espera a que ProseMirror lo lea. */
  const placeCursor = async (text: string, key: 'End' | 'Home') => {
    await editor.locator('> :is(p, h1, h2)', { hasText: text }).first().click()
    await page.keyboard.press(key)
    await page.waitForTimeout(150)
  }

  // Referencias > Insertar nota al pie: el número 1 y su cuadro para escribirla.
  await placeCursor('Un texto', 'End')
  await page.getByRole('tab', { name: 'Referencias' }).click()
  await page.getByRole('button', { name: 'Insertar nota al pie' }).click()
  const noteDialog = page.getByRole('dialog', { name: 'Nota al pie 1' })
  await noteDialog.getByLabel('Texto de la nota').fill('La primera nota, al pie de la hoja.')
  await noteDialog.getByRole('button', { name: 'Aceptar' }).click()
  await expect(editor.locator('sup.writer-note-ref')).toHaveText('1')
  // La nota sale al pie de la hoja 1, en la capa de notas.
  const footnote = page.locator('.writer-footnote-layer .writer-footnote')
  await expect(footnote).toHaveText('1 La primera nota, al pie de la hoja.')

  // Una nota al final con el atajo de Word: va detrás del texto, en romanos.
  await placeCursor('Y otra al final', 'End')
  await page.keyboard.press('Control+Alt+d')
  const endDialog = page.getByRole('dialog', { name: 'Nota al final' })
  await endDialog.getByLabel('Texto de la nota').fill('Nota del final.')
  await endDialog.getByRole('button', { name: 'Aceptar' }).click()
  await expect(page.locator('.writer-endnotes .writer-footnote')).toHaveText('i Nota del final.')

  // Una nota al pie delante de la primera la renumera: la vieja pasa a ser la 2.
  await placeCursor('Un texto', 'Home')
  await page.getByRole('button', { name: 'Insertar nota al pie' }).click()
  const second = page.getByRole('dialog', { name: 'Nota al pie 1' })
  await second.getByLabel('Texto de la nota').fill('Ahora soy la primera.')
  await second.getByRole('button', { name: 'Aceptar' }).click()
  await expect(editor.locator('sup.writer-note-ref[data-note="footnote"]')).toHaveText(['1', '2'])
  await expect(footnote).toHaveText(['1 Ahora soy la primera.', '2 La primera nota, al pie de la hoja.'])

  // La tabla de contenido, delante del primer título.
  await placeCursor('Introducción', 'Home')
  await page.getByRole('button', { name: 'Tabla de contenido' }).click()
  await page.getByRole('button', { name: /^Tabla automática/ }).click()
  const toc = editor.locator('.writer-toc')
  await expect(toc.locator('.writer-toc__text')).toHaveText(['Introducción', 'Desarrollo', 'Detalles'])
  await expect(toc.locator('.writer-toc__page')).toHaveText(['1', '2', '2'])
  await expect(editor.locator('> *').first()).toHaveClass(/writer-toc/)

  // Cambiar un título: la tabla avisa y "Actualizar tabla" la pone al día.
  await placeCursor('Desarrollo', 'End')
  await page.keyboard.insertText(' del proyecto')
  await expect(toc.locator('.writer-toc__update--stale')).toBeVisible()
  await page.getByRole('button', { name: 'Actualizar tabla' }).first().click()
  await expect(toc.locator('.writer-toc__text')).toHaveText(['Introducción', 'Desarrollo del proyecto', 'Detalles'])
  if (SHOTS) {
    await page.locator('.writer-canvas').evaluate((canvas) => (canvas.scrollTop = 0))
    await page.screenshot({ path: `${SHOTS}/notas-toc.png` })
    await page.locator('.writer-canvas').evaluate((canvas) => (canvas.scrollTop = 700))
    await page.screenshot({ path: `${SHOTS}/notas-toc-2.png` })
  }

  // Ctrl+clic en una entrada lleva al título (hoja 2).
  await toc.locator('.writer-toc__entry', { hasText: 'Detalles' }).click({ modifiers: ['Control'] })
  await expect(page.getByRole('contentinfo')).toContainText('Página 2 de 2')

  // En el PDF, cada nota al pie en su hoja y la del final detrás del texto.
  const pages = await exportPdfPages(tintero, 'notas.pdf')
  // (pdftotext escribe el número volado en su propio renglón.)
  expect(pages[0]).toMatch(/1\s+Ahora soy la primera\./)
  expect(pages[0]).toMatch(/2\s+La primera nota, al pie de la hoja\./)
  expect(pages[1]).toMatch(/i\s+Nota del final\./)
  expect(pages[1]).not.toContain('Ahora soy la primera')
})

test('Texto: títulos de figura, referencia cruzada, citas APA e ISO 690 y bibliografía', async ({ tintero }) => {
  const { page } = tintero
  await createBlank(page, 'Texto')
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.insertText('Primer párrafo.')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Segundo párrafo.')

  // Insertar título debajo del primer párrafo: "Figura 1: Mapa".
  await editor.locator('p', { hasText: 'Primer' }).click()
  await page.getByRole('tab', { name: 'Referencias' }).click()
  await page.getByRole('button', { name: 'Insertar título' }).click()
  const captionDialog = page.getByRole('dialog', { name: 'Insertar título' })
  await captionDialog.getByLabel('Texto del título').fill('Mapa de la zona')
  await captionDialog.getByRole('button', { name: 'Insertar' }).click()
  const captions = editor.locator('p[data-style="caption"]')
  await expect(captions).toHaveText(['Figura 1: Mapa de la zona'])

  // Otra figura delante: la de antes pasa a ser la 2.
  await editor.locator('p', { hasText: 'Primer' }).click()
  await page.getByRole('button', { name: 'Insertar título' }).click()
  await captionDialog.getByLabel('Texto del título').fill('Portada')
  await captionDialog.getByLabel('Posición').selectOption('above')
  await captionDialog.getByRole('button', { name: 'Insertar' }).click()
  await expect(captions).toHaveText(['Figura 1: Portada', 'Figura 2: Mapa de la zona'])

  // Referencia cruzada a "Figura 2" (solo rótulo y número) al final del segundo párrafo.
  await editor.locator('p', { hasText: 'Segundo' }).click()
  await page.keyboard.press('End')
  await page.keyboard.insertText(' Ver la ')
  await page.getByRole('button', { name: 'Referencia cruzada' }).click()
  const crossDialog = page.getByRole('dialog', { name: 'Referencia cruzada' })
  await crossDialog.getByLabel('Tipo de referencia').selectOption({ label: 'Figura' })
  await crossDialog.getByLabel('Referencia a').selectOption({ label: 'Solo rótulo y número' })
  await crossDialog.getByLabel('Destino').selectOption({ label: 'Figura 2: Mapa de la zona' })
  await crossDialog.getByRole('button', { name: 'Insertar' }).click()
  await expect(editor.locator('.writer-cross-ref')).toHaveText('Figura 2')

  // Fuentes: una a mano y dos desde BibTeX.
  await page.getByRole('button', { name: 'Administrar fuentes' }).click()
  const sources = page.getByRole('dialog', { name: 'Administrar fuentes' })
  await sources.getByLabel('Autores').fill('García López, Ana María')
  await sources.getByLabel('Título').fill('Introducción a la programación')
  await sources.getByLabel('Año').fill('2020')
  await sources.getByLabel('Editorial o institución').fill('Editorial Tintero')
  await sources.getByRole('button', { name: 'Agregar', exact: true }).click()
  await sources.getByText('Importar desde BibTeX').click()
  await sources
    .getByLabel('Texto BibTeX')
    .fill(
      '@article{perez19, author={Pérez, Luis and López, María and Ruiz, Eva}, title={Aprendizaje automático}, journal={Revista de Educación}, volume={12}, number={3}, pages={45--67}, year={2019}}'
    )
  await sources.getByRole('button', { name: 'Importar' }).click()
  await expect(sources.getByRole('status')).toHaveText('Se importó 1 fuente.')
  await sources.getByRole('button', { name: 'Cerrar' }).click()

  // Insertar cita y cambiarle las páginas con doble clic.
  await editor.locator('p', { hasText: 'Segundo' }).click()
  await page.keyboard.press('End')
  await page.keyboard.insertText(' Según ')
  await page.getByRole('button', { name: 'Insertar cita' }).click()
  await page.getByRole('button', { name: /^Aprendizaje automático/ }).click()
  const citation = editor.locator('.writer-citation')
  await expect(citation).toHaveText('(Pérez et al., 2019)')
  await citation.dblclick()
  const citationDialog = page.getByRole('dialog', { name: 'Editar cita' })
  await citationDialog.getByLabel('Páginas').fill('50-52')
  await citationDialog.getByRole('button', { name: 'Aceptar' }).click()
  await expect(citation).toHaveText('(Pérez et al., 2019, pp. 50–52)')

  // Bibliografía al final, en APA; cambiar a ISO 690 cambia citas y bibliografía a la vez.
  await page.keyboard.press('Control+End')
  await page.getByRole('button', { name: 'Bibliografía', exact: true }).click()
  await page.getByRole('button', { name: 'Referencias', exact: true }).click()
  const entries = editor.locator('.writer-bibliography__entry')
  await expect(entries).toHaveText([
    'García López, A. M. (2020). Introducción a la programación. Editorial Tintero.',
    'Pérez, L., López, M. y Ruiz, E. (2019). Aprendizaje automático. Revista de Educación, 12(3), 45–67.'
  ])
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/citas-apa.png` })
  await page.getByRole('button', { name: /^Estilo:/ }).click()
  await page.getByRole('button', { name: /^ISO 690/ }).click()
  await expect(citation).toHaveText('(PÉREZ, LÓPEZ y RUIZ, 2019, pp. 50–52)')
  await expect(entries.first()).toHaveText(
    'GARCÍA LÓPEZ, Ana María, 2020. Introducción a la programación. Editorial Tintero.'
  )
})
