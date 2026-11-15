import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import type { EditorProps } from '@/core/appModule'
import { useAiStatus } from '@/core/ai/useAiStatus'
import { useToolAgent } from '@/core/ai/useToolAgent'
import { initHistory, withHistory } from '@/core/history'
import { platform } from '@/core/platform'
import { EditorLayout } from '@/ui/EditorLayout'
import { ToolAgentPanel } from '@/ui/ai/ToolAgentPanel'
import { describeSheet } from '../model/ai/sheetContext'
import { buildSheetAgentRequest, interpretSheetCalls } from '../model/ai/sheetTools'
import { SHEETS_ACCENT } from '../constants'
import { MAX_ROWS, cellAddress, parseCellAddress, rangeAddress, rangeSize } from '../model/address'
import { getCellValue } from '../model/calc'
import { copyRange, fillRange, pasteCopiedCells, pasteText, type CopiedCells } from '../model/clipboard'
import type { Axis } from '../model/formula/structure'
import { canInsert } from '../model/structureEdit'
import { createSheet, nextSheetName } from '../model/factories'
import { formatGeneralNumber } from '../model/format'
import { localizedFunctionName } from '../model/formula/functionNames'
import { cellEditText, cellFromInput } from '../model/input'
import { canInsertReference, writeReference, type InsertedReference } from '../model/pointMode'
import {
  autoSumRange,
  jump,
  selectionRange,
  selectionStats,
  singleCell,
  step,
  usedRange,
  type Direction,
  type Selection
} from '../model/selection'
import type { Cell, CellCoord, CellRange, CellStyle, NumberFormatKind, Workbook } from '../model/types'
import { workbookReducer, type WorkbookAction } from '../model/workbookReducer'
import { FormulaBar } from './FormulaBar'
import { SheetGrid } from './SheetGrid'
import { SheetPrintView } from './SheetPrintView'
import { SHEETS_TABS, SheetsRibbon, type SheetCommands, type SheetsTabId } from './SheetsRibbon'
import { SheetTabs } from './SheetTabs'
import { useEvaluation } from './useEvaluation'
import { SheetAssistantPanel } from './ai/SheetAssistantPanel'
import { SheetsAssistantTab } from './ai/SheetsAssistantTab'
import { useSheetAssistant } from './ai/useSheetAssistant'

const historyReducer = withHistory(workbookReducer)

/** Más allá de este número de celdas, el formato se aplica solo a la parte con datos (ver clipForStyling). */
const MAX_STYLED_CELLS = 20_000

/**
 * Edición en curso. `mode` imita a Excel: en "enter" (empezaste a escribir sobre la celda) las
 * flechas confirman y mueven; en "edit" (F2, doble clic o barra de fórmulas) mueven el cursor.
 */
interface EditingState {
  coord: CellCoord
  text: string
  mode: 'enter' | 'edit'
  target: 'cell' | 'bar'
  /** Referencia insertada en modo señalar (clic en una celda mientras escribes una fórmula). */
  reference: (InsertedReference & { anchor: CellCoord; focus: CellCoord }) | null
  /** Dónde poner el cursor del <input> tras el siguiente render. */
  caret: number | null
}

const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

export function SheetsEditor({ initialContent, session, onChange }: EditorProps<Workbook>) {
  const [history, dispatch] = useReducer(historyReducer, initialContent, initHistory)
  const workbook = history.present
  const evaluation = useEvaluation(workbook)
  const sheet = workbook.sheets.find((candidate) => candidate.id === workbook.activeSheetId) ?? workbook.sheets[0]

  const [tab, setTab] = useState<SheetsTabId>('home')
  const [selection, setSelection] = useState<Selection>(singleCell({ row: 0, col: 0 }))
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [renamingSheetId, setRenamingSheetId] = useState<string | null>(null)
  /** Aviso corto en la barra de estado (p. ej. "no se puede insertar"). Se borra al cambiar la selección. */
  const [notice, setNotice] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cellInputRef = useRef<HTMLInputElement>(null)
  const barInputRef = useRef<HTMLInputElement>(null)
  const clipboard = useRef<{ copied: CopiedCells; sheetId: string; cut: boolean } | null>(null)
  const pointing = useRef(false)

  const range = selectionRange(selection)
  const [noticeSelection, setNoticeSelection] = useState(selection)
  if (noticeSelection !== selection) {
    setNoticeSelection(selection)
    if (notice) setNotice(null)
  }
  const anchorAddress = cellAddress(selection.anchor)
  const activeCell = sheet.cells[anchorAddress]

  // Avisar al shell de cada cambio (salvo el estado inicial) para marcar "sin guardar".
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    onChange(workbook)
  }, [workbook, onChange])

  // Al cambiar de hoja (pestaña, deshacer...) la selección vuelve a A1 y se abandona la edición.
  const [shownSheetId, setShownSheetId] = useState(sheet.id)
  if (shownSheetId !== sheet.id) {
    setShownSheetId(sheet.id)
    setSelection(singleCell({ row: 0, col: 0 }))
    setEditing(null)
  }

  const apply = useCallback(
    (action: WorkbookAction, coalesceKey?: string) => dispatch({ type: 'history/apply', action, coalesceKey }),
    []
  )
  const focusGrid = () => viewportRef.current?.focus()

  // ---------- Asistente de IA ----------

  const ai = useAiStatus()
  const assistant = useSheetAssistant({ workbook, evaluation, sheet, anchor: selection.anchor, range, apply })
  // Lo que el agente necesita leer al pedir los cambios (siempre lo último, no lo del render en que se creó).
  const agentContext = useRef({ workbook, evaluation, sheet, anchorAddress })
  agentContext.current = { workbook, evaluation, sheet, anchorAddress }
  const agent = useToolAgent<Workbook, WorkbookAction>({
    getState: () => agentContext.current.workbook,
    buildRequest: (_state, request) => {
      const current = agentContext.current
      return buildSheetAgentRequest(
        describeSheet(current.sheet, current.evaluation).text,
        current.anchorAddress,
        request
      )
    },
    interpret: (state, calls) =>
      interpretSheetCalls(
        state,
        { sheetId: agentContext.current.sheet.id, evaluation: agentContext.current.evaluation },
        calls
      ),
    applyActions: (actions) => dispatch({ type: 'history/applyBatch', actions })
  })
  /** Panel abierto: cómo preparar Ollama, fórmulas/explicar/analizar, o el agente de cambios. */
  const [aiPanel, setAiPanel] = useState<'closed' | 'setup' | 'open' | 'agent'>('closed')
  const aiBusy =
    assistant.generation.phase === 'running' ||
    (assistant.job?.kind === 'formula' && assistant.job.job.phase === 'running') ||
    agent.job?.phase === 'running'

  /** Comprueba el estado justo antes de usarla: el usuario puede haber abierto Ollama hace un momento. */
  const runAssistant = async (action: () => void, panel: 'open' | 'agent' = 'open') => {
    if (editing) commitEditing(null)
    const status = ai.status?.state === 'ready' ? ai.status : await ai.refresh()
    if (status.state !== 'ready') {
      setAiPanel('setup')
      return
    }
    if (panel === 'agent') assistant.close()
    else agent.close()
    setAiPanel(panel)
    action()
  }

  const closeAssistant = () => {
    assistant.close()
    agent.close()
    setAiPanel('closed')
    focusGrid()
  }

  // Colocar el cursor del <input> donde toca tras insertar una referencia o empezar a escribir.
  useEffect(() => {
    if (!editing || editing.caret === null) return
    const input = editing.target === 'bar' ? barInputRef.current : cellInputRef.current
    if (!input) return
    if (document.activeElement !== input) input.focus()
    input.setSelectionRange(editing.caret, editing.caret)
  }, [editing])

  // ---------- Edición de celdas ----------

  const startEditing = (mode: EditingState['mode'], text: string, target: EditingState['target'] = 'cell') =>
    setEditing({ coord: selection.anchor, text, mode, target, reference: null, caret: text.length })

  // Copia de `editing` que se vacía al confirmar. Un clic en otra celda confirma desde pointerdown
  // y, justo después, el <input> pierde el foco y vuelve a confirmar con el estado del render anterior:
  // sin esta guarda, la misma edición entraría dos veces en el historial de deshacer.
  const editingRef = useRef(editing)
  editingRef.current = editing

  const commitEditing = (move: Direction | null) => {
    const current = editingRef.current
    if (!current) return
    editingRef.current = null
    const address = cellAddress(current.coord)
    const previous = sheet.cells[address]
    const next = cellFromInput(current.text, previous)
    if (JSON.stringify(next) !== JSON.stringify(previous ?? null)) {
      apply({ type: 'cells/set', sheetId: sheet.id, cells: { [address]: next } })
    }
    setEditing(null)
    if (move) setSelection(singleCell(step(current.coord, move)))
    focusGrid()
  }

  const cancelEditing = () => {
    editingRef.current = null
    setEditing(null)
    focusGrid()
  }

  /** Modo señalar: escribe la referencia de `anchor:focus` en la fórmula que se está editando. */
  const pointAt = (anchor: CellCoord, focus: CellCoord) => {
    if (!editing) return
    const input = editing.target === 'bar' ? barInputRef.current : cellInputRef.current
    const caret = input?.selectionStart ?? editing.text.length
    const target = editing.reference ?? { start: caret, end: input?.selectionEnd ?? caret }
    const address = rangeAddress({
      start: { row: Math.min(anchor.row, focus.row), col: Math.min(anchor.col, focus.col) },
      end: { row: Math.max(anchor.row, focus.row), col: Math.max(anchor.col, focus.col) }
    })
    const { text, inserted } = writeReference(editing.text, address, target)
    setEditing({ ...editing, text, reference: { ...inserted, anchor, focus }, caret: inserted.end })
  }

  const isPointable = () => {
    if (!editing) return false
    if (editing.reference) return true
    const input = editing.target === 'bar' ? barInputRef.current : cellInputRef.current
    return canInsertReference(editing.text, input?.selectionStart ?? editing.text.length)
  }

  const onEditorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!editing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEditing(event.shiftKey ? 'up' : 'down')
    } else if (event.key === 'Tab') {
      event.preventDefault()
      commitEditing(event.shiftKey ? 'left' : 'right')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    } else if (event.key in ARROWS && editing.mode === 'enter') {
      event.preventDefault()
      const direction = ARROWS[event.key]
      if (isPointable()) {
        // Con una fórmula a medias, las flechas eligen la celda a la que apuntar (como Excel).
        const from = editing.reference?.focus ?? editing.coord
        const focus = step(from, direction)
        pointAt(event.shiftKey && editing.reference ? editing.reference.anchor : focus, focus)
      } else {
        commitEditing(direction)
      }
    }
  }

  const onEditorChange = (text: string) => {
    if (editing) setEditing({ ...editing, text, reference: null, caret: null })
  }

  // ---------- Selección y formato ----------

  /**
   * El formato de una columna entera (10.000 celdas) o de toda la hoja (7 millones) crearía una
   * celda por cada hueco. Para rangos grandes lo aplicamos solo a la zona con datos.
   * Es una limitación conocida: Excel guarda el formato por columna, nosotros por celda.
   */
  const clipForStyling = (target: CellRange): CellRange | null => {
    const { rows, cols } = rangeSize(target)
    if (rows * cols <= MAX_STYLED_CELLS) return target
    const used = usedRange(sheet)
    if (!used) return null
    const start = { row: Math.max(target.start.row, used.start.row), col: Math.max(target.start.col, used.start.col) }
    const end = { row: Math.min(target.end.row, used.end.row), col: Math.min(target.end.col, used.end.col) }
    return start.row <= end.row && start.col <= end.col ? { start, end } : null
  }

  const styleSelection = (style: Partial<CellStyle>) => {
    const target = clipForStyling(range)
    if (target) apply({ type: 'cells/style', sheetId: sheet.id, range: target, style })
  }

  const activeStyle: CellStyle = activeCell?.style ?? {}

  /** Insertar o borrar tantas filas (o columnas) como abarque la selección, desde su primera. */
  const changeStructure = (kind: 'insert' | 'delete', axis: Axis) => {
    const at = axis === 'rows' ? range.start.row : range.start.col
    const { rows, cols } = rangeSize(range)
    const change = { kind, axis, at, count: axis === 'rows' ? rows : cols }
    if (!canInsert(sheet, change)) {
      setNotice('No se puede insertar: empujaría datos fuera de la hoja.')
      return
    }
    if (editing) commitEditing(null)
    apply({ type: 'structure/change', sheetId: sheet.id, change })
    // Tras borrar, la selección se queda donde estaba (ahora con lo que había debajo o a la derecha).
    setSelection(singleCell(axis === 'rows' ? { row: at, col: range.start.col } : { row: range.start.row, col: at }))
  }

  const commands: SheetCommands = {
    toggleStyle: (key) => styleSelection({ [key]: activeStyle[key] ? undefined : true }),
    setStyle: styleSelection,
    setBorders: (mode) => {
      const target = clipForStyling(range)
      if (target) apply({ type: 'cells/borders', sheetId: sheet.id, range: target, mode })
    },
    setNumberFormat: (kind: NumberFormatKind) =>
      styleSelection({ numberFormat: kind === 'general' ? undefined : { kind, decimals: defaultDecimals(kind) } }),
    changeDecimals: (delta) => {
      const current = activeStyle.numberFormat
      const kind = current && current.kind !== 'general' && current.kind !== 'date' ? current.kind : 'number'
      const decimals = Math.min(10, Math.max(0, (current?.decimals ?? defaultDecimals(kind) ?? 2) + delta))
      styleSelection({ numberFormat: { kind, decimals } })
    },
    addSheet: () => apply({ type: 'sheet/add', sheet: createSheet(nextSheetName(workbook)) }),
    renameActiveSheet: () => setRenamingSheetId(sheet.id),
    deleteActiveSheet: () => apply({ type: 'sheet/delete', sheetId: sheet.id }),
    autoSum: () => {
      const target = autoSumRange(selection.anchor, (coord) => getCellValue(evaluation, sheet.id, cellAddress(coord)))
      const formula = `=${localizedFunctionName('SUM')}(${target ? rangeAddress(target) : ''})`
      startEditing('edit', formula)
    },
    insertFunction: (name) => startEditing('edit', `=${localizedFunctionName(name)}(`),
    insertRows: () => changeStructure('insert', 'rows'),
    insertColumns: () => changeStructure('insert', 'columns'),
    deleteRows: () => changeStructure('delete', 'rows'),
    deleteColumns: () => changeStructure('delete', 'columns'),
    fill: (direction) => {
      const target = clipForStyling(range)
      if (target) apply({ type: 'cells/set', sheetId: sheet.id, cells: fillRange(sheet, target, direction) })
    }
  }

  // ---------- Teclado de la cuadrícula ----------

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return
    const mod = event.metaKey || event.ctrlKey
    const key = event.key

    if (key in ARROWS) {
      event.preventDefault()
      const direction = ARROWS[key]
      const from = event.shiftKey ? selection.focus : selection.anchor
      const to = mod ? jump(sheet, from, direction) : step(from, direction)
      setSelection(event.shiftKey ? { anchor: selection.anchor, focus: to } : singleCell(to))
      return
    }
    if (mod) {
      const lower = key.toLowerCase()
      const shortcuts: Record<string, () => void> = {
        z: () => dispatch({ type: event.shiftKey ? 'history/redo' : 'history/undo' }),
        y: () => dispatch({ type: 'history/redo' }),
        b: () => commands.toggleStyle('bold'),
        i: () => commands.toggleStyle('italic'),
        u: () => commands.toggleStyle('underline'),
        d: () => commands.fill('down'),
        r: () => commands.fill('right'),
        a: () => {
          const used = usedRange(sheet)
          if (used) setSelection({ anchor: used.start, focus: used.end })
        },
        home: () => setSelection(singleCell({ row: 0, col: 0 })),
        // Ctrl+"+" y Ctrl+"-" de Excel: con columnas enteras seleccionadas, columnas; si no, filas.
        '+': () => changeStructure('insert', isWholeColumns(range) ? 'columns' : 'rows'),
        '-': () => changeStructure('delete', isWholeColumns(range) ? 'columns' : 'rows')
      }
      if (shortcuts[lower]) {
        event.preventDefault()
        shortcuts[lower]()
      }
      return
    }

    switch (key) {
      case 'Enter':
      case 'Tab': {
        event.preventDefault()
        const direction: Direction =
          key === 'Enter' ? (event.shiftKey ? 'up' : 'down') : event.shiftKey ? 'left' : 'right'
        setSelection(singleCell(step(selection.anchor, direction)))
        return
      }
      case 'F2':
        event.preventDefault()
        startEditing('edit', cellEditText(activeCell))
        return
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        apply({ type: 'cells/clear', sheetId: sheet.id, range })
        return
      case 'Home':
        event.preventDefault()
        setSelection(singleCell({ row: selection.anchor.row, col: 0 }))
        return
      case 'PageDown':
      case 'PageUp': {
        event.preventDefault()
        const pageRows = Math.max(1, Math.floor((viewportRef.current?.clientHeight ?? 400) / 22) - 1)
        setSelection(singleCell(step(selection.anchor, key === 'PageDown' ? 'down' : 'up', pageRows)))
        return
      }
    }

    // Una tecla imprimible empieza a escribir y sustituye el contenido, como en Excel.
    if (key.length === 1 && !event.altKey) {
      event.preventDefault()
      startEditing('enter', key)
    }
  }

  // ---------- Portapapeles ----------

  useEffect(() => {
    const gridHasFocus = () => document.activeElement === viewportRef.current
    const onCopy = (event: ClipboardEvent, cut: boolean) => {
      if (!gridHasFocus() || !event.clipboardData) return
      event.preventDefault()
      // Copiar "toda la hoja" copia solo la zona con datos (igual que el formato, ver clipForStyling).
      const copied = copyRange(sheet, clipForStyling(range) ?? range, evaluation)
      clipboard.current = { copied, sheetId: sheet.id, cut }
      event.clipboardData.setData('text/plain', copied.text)
    }
    const onPaste = (event: ClipboardEvent) => {
      if (!gridHasFocus() || !event.clipboardData) return
      event.preventDefault()
      const text = event.clipboardData.getData('text/plain')
      const internal = clipboard.current
      const target = selection.anchor
      const fromTintero = internal !== null && internal.copied.text === text
      let cells: Record<string, Cell | null>
      if (fromTintero && internal.cut && internal.sheetId === sheet.id) {
        // Cortar y pegar MUEVE: las fórmulas de todo el libro que apuntaban a lo movido lo siguen.
        const source = copiedRange(internal.copied)
        apply({ type: 'range/move', sheetId: sheet.id, source, target })
        clipboard.current = null
        const size = rangeSize(source)
        setSelection({ anchor: target, focus: { row: target.row + size.rows - 1, col: target.col + size.cols - 1 } })
        return
      } else if (fromTintero) {
        cells = pasteCopiedCells(internal.copied, target)
      } else {
        cells = pasteText(text, target, sheet)
      }
      apply({ type: 'cells/set', sheetId: sheet.id, cells })
      setSelection({ anchor: target, focus: lastPastedCell(target, cells) })
    }
    const copy = (event: ClipboardEvent) => onCopy(event, false)
    const cut = (event: ClipboardEvent) => onCopy(event, true)
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', onPaste)
    }
  })

  // ---------- Barra de estado ----------

  const stats = useMemo(
    () => selectionStats(sheet, range, (address) => getCellValue(evaluation, sheet.id, address)),
    [sheet, range.start.row, range.start.col, range.end.row, range.end.col, evaluation] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const cellEditor = editing && editing.target === 'cell' && (
    <input
      ref={cellInputRef}
      className="sheet-cell-editor__input"
      aria-label={`Editar ${cellAddress(editing.coord)}`}
      spellCheck={false}
      autoFocus
      value={editing.text}
      size={Math.max(4, editing.text.length + 1)}
      onChange={(event) => onEditorChange(event.target.value)}
      onKeyDown={onEditorKeyDown}
      onBlur={(event) => {
        // Si el foco se va a la barra de fórmulas seguimos editando; a cualquier otro sitio, se confirma.
        if (event.relatedTarget !== barInputRef.current) commitEditing(null)
      }}
    />
  )

  return (
    <EditorLayout
      accentColor={SHEETS_ACCENT}
      documentName={session.documentName}
      isDirty={session.isDirty}
      onHome={session.goHome}
      onSave={session.save}
      onUndo={() => {
        setEditing(null)
        dispatch({ type: 'history/undo' })
      }}
      onRedo={() => {
        setEditing(null)
        dispatch({ type: 'history/redo' })
      }}
      canUndo={history.past.length > 0}
      canRedo={history.future.length > 0}
      onPrint={() => void platform.window.print()}
      exportOptions={session.exportOptions}
      tabs={SHEETS_TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id as SheetsTabId)}
      ribbon={
        tab === 'assistant' ? (
          <SheetsAssistantTab
            status={ai.status}
            busy={aiBusy}
            activeCellHasFormula={activeCell?.formula !== undefined}
            onFormula={() => void runAssistant(assistant.openFormula)}
            onExplain={() => void runAssistant(assistant.explain)}
            onAnalyze={() => void runAssistant(assistant.analyze)}
            onAsk={() => void runAssistant(agent.open, 'agent')}
            onSelectModel={(model) => void ai.setModel(model)}
          />
        ) : (
          <SheetsRibbon
            tab={tab}
            activeStyle={activeStyle}
            canDeleteSheet={workbook.sheets.length > 1}
            commands={commands}
          />
        )
      }
      statusBar={
        <>
          <span>
            {sheet.name} · {rangeAddress(range)}
          </span>
          {notice && <span role="status">{notice}</span>}
          <span className="statusbar__spacer" />
          {stats.count > 1 && (
            <>
              {stats.numericCount > 0 && <span>Promedio: {formatGeneralNumber(stats.sum / stats.numericCount)}</span>}
              <span>Recuento: {stats.count}</span>
              {stats.numericCount > 0 && <span>Suma: {formatGeneralNumber(stats.sum)}</span>}
            </>
          )}
        </>
      }
    >
      {aiPanel === 'agent' && (
        <ToolAgentPanel
          appLabel="Hojas de cálculo"
          job={agent.job}
          setupStatus={null}
          model={ai.status?.state === 'ready' ? ai.status.model : null}
          examples={[
            'Pon en negrita la fila 1 y rellénala de amarillo',
            'Añade una fila de totales debajo de los datos',
            'Formato de moneda en la columna B'
          ]}
          onRequestChange={agent.setRequest}
          onPropose={(request) => void agent.propose(request)}
          onApply={() => {
            agent.apply()
            focusGrid()
          }}
          onCancel={agent.cancel}
          onEdit={agent.open}
          onRetrySetup={() => void ai.refresh()}
          onClose={closeAssistant}
        />
      )}
      {(aiPanel === 'open' || aiPanel === 'setup') && (
        <SheetAssistantPanel
          assistant={assistant}
          setupStatus={aiPanel === 'setup' ? ai.status : null}
          model={ai.status?.state === 'ready' ? ai.status.model : null}
          targetHasContent={assistant.job?.kind === 'formula' && isFilled(sheet.cells[assistant.job.target])}
          onRetrySetup={() => void ai.refresh().then((status) => status.state === 'ready' && setAiPanel('open'))}
          onClose={closeAssistant}
        />
      )}
      <div className="sheets-workspace">
        <FormulaBar
          location={rangeAddress(range)}
          value={editing ? editing.text : cellEditText(activeCell)}
          inputRef={barInputRef}
          onFocus={() => {
            if (!editing) startEditing('edit', cellEditText(activeCell), 'bar')
            else if (editing.target === 'cell') setEditing({ ...editing, target: 'bar', caret: null })
          }}
          onChange={onEditorChange}
          onKeyDown={onEditorKeyDown}
          onAutoSum={commands.autoSum}
        />
        <SheetGrid
          sheet={sheet}
          evaluation={evaluation}
          selection={
            editing?.reference ? { anchor: editing.reference.anchor, focus: editing.reference.focus } : selection
          }
          editor={cellEditor || null}
          viewportRef={viewportRef}
          onKeyDown={onGridKeyDown}
          onCellPointerDown={(coord, extend) => {
            if (editing && isPointable()) {
              pointing.current = true
              pointAt(extend && editing.reference ? editing.reference.anchor : coord, coord)
              return true
            }
            pointing.current = false
            if (editing) commitEditing(null)
            setSelection(extend ? { anchor: selection.anchor, focus: coord } : singleCell(coord))
            focusGrid()
            return false
          }}
          onCellDrag={(coord) => {
            if (pointing.current && editing?.reference) {
              pointAt(editing.reference.anchor, coord)
            } else if (!editing) {
              setSelection((current) =>
                current.focus.row === coord.row && current.focus.col === coord.col
                  ? current
                  : { anchor: current.anchor, focus: coord }
              )
            }
          }}
          onCellDoubleClick={(coord) => {
            setSelection(singleCell(coord))
            setEditing({
              coord,
              text: cellEditText(sheet.cells[cellAddress(coord)]),
              mode: 'edit',
              target: 'cell',
              reference: null,
              caret: cellEditText(sheet.cells[cellAddress(coord)]).length
            })
          }}
          onSelect={(next) => {
            if (editing) commitEditing(null)
            setSelection(next)
          }}
          onColumnResize={(col, width) =>
            apply({ type: 'column/resize', sheetId: sheet.id, col, width }, `resize-${sheet.id}-${col}`)
          }
        />
        <SheetTabs
          workbook={workbook}
          renamingSheetId={renamingSheetId}
          onSelect={(sheetId) => {
            if (editing) commitEditing(null)
            dispatch({ type: 'history/applyWithoutUndo', action: { type: 'sheet/select', sheetId } })
          }}
          onAdd={commands.addSheet}
          onStartRename={setRenamingSheetId}
          onRename={(sheetId, name) => {
            apply({ type: 'sheet/rename', sheetId, name })
            setRenamingSheetId(null)
            focusGrid()
          }}
          onCancelRename={() => {
            setRenamingSheetId(null)
            focusGrid()
          }}
        />
      </div>

      {/* Solo visible al imprimir (y al exportar a PDF): la zona con datos de la hoja activa. */}
      <SheetPrintView sheet={sheet} evaluation={evaluation} />
    </EditorLayout>
  )
}

function isFilled(cell: Cell | undefined): boolean {
  return cell?.formula !== undefined || cell?.value !== undefined
}

function defaultDecimals(kind: NumberFormatKind): number | undefined {
  if (kind === 'number' || kind === 'currency') return 2
  if (kind === 'percent') return 0
  return undefined
}

/** Rango del que salió lo copiado. */
function copiedRange(copied: CopiedCells): CellRange {
  const rows = copied.cells.length
  const cols = copied.cells[0]?.length ?? 1
  return {
    start: copied.origin,
    end: { row: copied.origin.row + rows - 1, col: copied.origin.col + cols - 1 }
  }
}

function isWholeColumns(range: CellRange): boolean {
  return range.start.row === 0 && range.end.row === MAX_ROWS - 1
}

/** Esquina inferior derecha de lo pegado, para dejarlo seleccionado. */
function lastPastedCell(target: CellCoord, cells: Record<string, Cell | null>): CellCoord {
  let focus = target
  for (const address of Object.keys(cells)) {
    const coord = parseCellAddress(address)
    if (coord && coord.row >= target.row && coord.col >= target.col) {
      focus = { row: Math.max(focus.row, coord.row), col: Math.max(focus.col, coord.col) }
    }
  }
  return focus
}
