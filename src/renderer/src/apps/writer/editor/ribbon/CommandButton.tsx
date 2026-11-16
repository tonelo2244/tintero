import type { ReactNode } from 'react'
import { MenuItem, ToolButton } from '@/ui/Ribbon'
import {
  commandLabel,
  commandState,
  runCommand,
  type ArgsOf,
  type CommandArg,
  type WriterCommandId
} from '../../model/commands'
import { useCommandContext } from './commandContext'

/** Los comandos con argumento lo exigen; los que no tienen, no lo aceptan. */
type ArgProp<Id extends WriterCommandId> = CommandArg<Id> extends undefined ? { arg?: never } : { arg: CommandArg<Id> }

type CommandButtonProps<Id extends WriterCommandId> = {
  command: Id
  icon: ReactNode
  /** Texto distinto del nombre del comando (p. ej. "Ver comentarios (3)" o "Centrar"). */
  label?: string
  large?: boolean
  showLabel?: boolean
} & ArgProp<Id>

/**
 * Botón de la cinta que solo sabe el id de su comando: nombre, atajo, si está activo o disponible y
 * qué hace los saca del registro (model/commands.ts).
 */
export function CommandButton<Id extends WriterCommandId>(props: CommandButtonProps<Id>) {
  const context = useCommandContext()
  const args = ('arg' in props ? [props.arg] : []) as ArgsOf<Id>
  const { label, shortcut } = commandLabel(props.command)
  const state = commandState(context, props.command, ...args)
  return (
    <ToolButton
      label={props.label ?? label}
      shortcut={shortcut}
      large={props.large}
      showLabel={props.showLabel}
      active={state.active}
      disabled={!state.enabled}
      onClick={() => runCommand(context, props.command, ...args)}
    >
      {props.icon}
    </ToolButton>
  )
}

type CommandMenuItemProps<Id extends WriterCommandId> = {
  command: Id
  children: ReactNode
  /** Cierra el desplegable después de ejecutar. */
  onDone(): void
} & ArgProp<Id>

/** Opción de un desplegable que ejecuta un comando; marca con ✓ la que está activa. */
export function CommandMenuItem<Id extends WriterCommandId>(props: CommandMenuItemProps<Id>) {
  const context = useCommandContext()
  const args = ('arg' in props ? [props.arg] : []) as ArgsOf<Id>
  const state = commandState(context, props.command, ...args)
  return (
    <MenuItem
      disabled={!state.enabled}
      onSelect={() => {
        runCommand(context, props.command, ...args)
        props.onDone()
      }}
    >
      <span className="menu-item__check" aria-hidden>
        {state.active ? '✓' : ''}
      </span>
      {props.children}
    </MenuItem>
  )
}
