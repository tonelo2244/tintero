import { Menu, type BrowserWindow } from 'electron'
import { buildContextMenuTemplate } from './contextMenu'

/** Idiomas del corrector en Windows y Linux, si Chromium los tiene. */
const PREFERRED_LANGUAGES = ['es-ES', 'es', 'en-US']

/**
 * Corrector ortográfico de Chromium (el que trae Electron) con sugerencias en el clic derecho.
 *
 * - macOS usa el corrector del sistema: el mismo de Pages o Notas, con los idiomas que tengas
 *   en Ajustes y tu diccionario personal. Todo local.
 * - Windows y Linux usan Hunspell: Chromium descarga el diccionario de cada idioma la primera vez
 *   (unos pocos MB) y después funciona sin conexión. Es la única descarga de la app, y no envía
 *   tus textos: solo baja el diccionario.
 */
export function attachSpellcheck(window: BrowserWindow): void {
  const { session } = window.webContents
  if (process.platform !== 'darwin') {
    const available = new Set(session.availableSpellCheckerLanguages)
    const languages = PREFERRED_LANGUAGES.filter((language) => available.has(language))
    if (languages.length > 0) session.setSpellCheckerLanguages(languages)
  }

  window.webContents.on('context-menu', (_event, params) => {
    const template = buildContextMenuTemplate(params, {
      replaceMisspelling: (word) => window.webContents.replaceMisspelling(word),
      addToDictionary: (word) => session.addWordToSpellCheckerDictionary(word)
    })
    if (template.length > 0) Menu.buildFromTemplate(template).popup({ window })
  })
}
