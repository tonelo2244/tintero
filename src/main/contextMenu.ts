import type { MenuItemConstructorOptions } from 'electron'

/** Lo que necesitamos de los ContextMenuParams de Electron (subconjunto, para poder probarlo). */
export interface ContextMenuInput {
  isEditable: boolean
  selectionText: string
  /** Palabra mal escrita bajo el cursor, o cadena vacía. */
  misspelledWord: string
  dictionarySuggestions: string[]
}

export interface ContextMenuActions {
  replaceMisspelling(word: string): void
  addToDictionary(word: string): void
}

const MAX_SUGGESTIONS = 5

/**
 * Menú del clic derecho. Electron no trae ninguno: sin esto, el corrector subraya en rojo pero
 * no hay forma de elegir la corrección. Función pura: recibe los datos y devuelve la plantilla.
 */
export function buildContextMenuTemplate(
  input: ContextMenuInput,
  actions: ContextMenuActions
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []

  if (input.isEditable && input.misspelledWord) {
    const suggestions = input.dictionarySuggestions.slice(0, MAX_SUGGESTIONS)
    if (suggestions.length === 0) items.push({ label: 'Sin sugerencias', enabled: false })
    for (const suggestion of suggestions) {
      items.push({ label: suggestion, click: () => actions.replaceMisspelling(suggestion) })
    }
    items.push(
      { type: 'separator' },
      {
        label: `Añadir «${input.misspelledWord}» al diccionario`,
        click: () => actions.addToDictionary(input.misspelledWord)
      },
      { type: 'separator' }
    )
  }

  if (input.isEditable) {
    items.push(
      { role: 'cut', label: 'Cortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Pegar' },
      { type: 'separator' },
      { role: 'selectAll', label: 'Seleccionar todo' }
    )
  } else if (input.selectionText.trim()) {
    items.push({ role: 'copy', label: 'Copiar' })
  }
  return items
}
