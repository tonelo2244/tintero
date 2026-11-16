import { createContext, useContext, type ReactNode } from 'react'
import type { CommandContext } from '../../model/commands'

const WriterCommandsContext = createContext<CommandContext | null>(null)

/**
 * Da a toda la cinta el editor y la interfaz con los que se ejecutan los comandos. El valor se
 * crea en cada render de WriterEditor (que se repinta cuando cambia el estado de la barra), así los
 * botones vuelven a preguntar si están activos sin suscribirse cada uno al editor.
 */
export function WriterCommandsProvider({ value, children }: { value: CommandContext; children: ReactNode }) {
  return <WriterCommandsContext.Provider value={value}>{children}</WriterCommandsContext.Provider>
}

export function useCommandContext(): CommandContext {
  const context = useContext(WriterCommandsContext)
  if (!context) throw new Error('La cinta de Texto necesita WriterCommandsProvider.')
  return context
}
