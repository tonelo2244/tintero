import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { validateSheetName } from '../model/factories'
import type { Workbook } from '../model/types'

interface SheetTabsProps {
  workbook: Workbook
  renamingSheetId: string | null
  onSelect(sheetId: string): void
  onAdd(): void
  onStartRename(sheetId: string): void
  onRename(sheetId: string, name: string): void
  onCancelRename(): void
}

/** Pestañas de hojas, abajo como en cualquier hoja de cálculo. Doble clic para cambiar el nombre. */
export function SheetTabs(props: SheetTabsProps) {
  const { workbook } = props
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Hojas">
      <button
        type="button"
        className="sheet-tabs__add"
        title="Nueva hoja"
        aria-label="Nueva hoja"
        onClick={props.onAdd}
      >
        <Plus size={14} />
      </button>
      {workbook.sheets.map((sheet) =>
        sheet.id === props.renamingSheetId ? (
          <RenameInput
            key={sheet.id}
            initialName={sheet.name}
            validate={(name) => validateSheetName(workbook, name, sheet.id)}
            onConfirm={(name) => props.onRename(sheet.id, name)}
            onCancel={props.onCancelRename}
          />
        ) : (
          <button
            key={sheet.id}
            type="button"
            role="tab"
            aria-selected={sheet.id === workbook.activeSheetId}
            className="sheet-tabs__tab"
            title="Doble clic para cambiar el nombre"
            onClick={() => props.onSelect(sheet.id)}
            onDoubleClick={() => props.onStartRename(sheet.id)}
          >
            {sheet.name}
          </button>
        )
      )}
    </div>
  )
}

function RenameInput(props: {
  initialName: string
  validate(name: string): string | null
  onConfirm(name: string): void
  onCancel(): void
}) {
  const [name, setName] = useState(props.initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  const problem = name.trim() === props.initialName ? null : props.validate(name)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const confirm = () => {
    if (problem || name.trim() === props.initialName) props.onCancel()
    else props.onConfirm(name.trim())
  }

  return (
    <input
      ref={inputRef}
      className={`sheet-tabs__rename ${problem ? 'is-invalid' : ''}`}
      aria-label="Nombre de la hoja"
      aria-invalid={problem !== null}
      title={problem ?? 'Intro para confirmar, Esc para cancelar'}
      value={name}
      size={Math.max(6, name.length + 1)}
      onChange={(event) => setName(event.target.value)}
      onBlur={confirm}
      onKeyDown={(event) => {
        if (event.key === 'Enter') confirm()
        else if (event.key === 'Escape') props.onCancel()
      }}
    />
  )
}
