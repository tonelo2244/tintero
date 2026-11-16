import { Extension } from '@tiptap/core'
import { commandKeyBindings, runCommand, type CommandContext, type WriterCommandId } from '../model/commands'

interface CommandShortcutsOptions {
  /** El contexto vive en React (cambia con cada render); la extensión lo pide al pulsar la tecla. */
  getContext: () => CommandContext | null
}

/**
 * Atajos de teclado del registro de comandos: la tecla ejecuta el MISMO comando que el botón de la
 * cinta. Si el comando no está disponible (p. ej. un salto de página dentro de una tabla) devuelve
 * false y la tecla sigue su camino normal en el editor.
 */
export const CommandShortcuts = Extension.create<CommandShortcutsOptions>({
  name: 'commandShortcuts',
  // Por delante del mapa de teclas de serie (Mod-Enter sale de un bloque de código, por ejemplo).
  priority: 101,

  addOptions() {
    return { getContext: () => null }
  },

  addKeyboardShortcuts() {
    return Object.fromEntries(
      commandKeyBindings().map(({ keys, id }) => [
        keys,
        () => {
          const context = this.options.getContext()
          // Solo los comandos sin argumento tienen atajo propio.
          return context ? runCommand(context, id as Extract<WriterCommandId, 'pageBreak'>) : false
        }
      ])
    )
  }
})
