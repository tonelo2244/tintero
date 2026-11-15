import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowRightToLine,
  Baseline,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Bold,
  ChevronDown,
  Columns3,
  DecimalsArrowLeft,
  DecimalsArrowRight,
  Grid2x2,
  Grid2x2X,
  Italic,
  PaintBucket,
  PanelBottom,
  Pencil,
  Plus,
  Rows3,
  Search,
  Sigma,
  Square,
  SquareFunction,
  TableCellsMerge,
  TableCellsSplit,
  TableRowsSplit,
  Trash2,
  Underline,
  WrapText
} from 'lucide-react'
import { ColorPicker } from '@/ui/ColorPicker'
import { Dropdown, MenuItem, RibbonGroup, RibbonRow, SelectField, ToolButton } from '@/ui/Ribbon'
import { localizedFunctionName } from '../model/formula/functionNames'
import type { CellStyle, HorizontalAlign, NumberFormatKind } from '../model/types'
import type { BorderMode } from '../model/workbookReducer'
import { DataTab } from './SheetsDataTab'
import { ViewTab } from './SheetsViewTab'

export type SheetsTabId = 'home' | 'insert' | 'formulas' | 'data' | 'view' | 'assistant'

export const SHEETS_TABS: { id: SheetsTabId; label: string }[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'insert', label: 'Insertar' },
  { id: 'formulas', label: 'Fórmulas' },
  { id: 'data', label: 'Datos' },
  { id: 'view', label: 'Vista' },
  { id: 'assistant', label: 'Asistente' }
]

/** Lo que la cinta puede pedirle al editor. La cinta no sabe nada del libro ni de la selección. */
export interface SheetCommands {
  toggleStyle(key: 'bold' | 'italic' | 'underline'): void
  setStyle(style: Partial<CellStyle>): void
  setBorders(mode: BorderMode): void
  setNumberFormat(kind: NumberFormatKind): void
  changeDecimals(delta: 1 | -1): void
  addSheet(): void
  renameActiveSheet(): void
  deleteActiveSheet(): void
  autoSum(): void
  insertFunction(canonicalName: string): void
  fill(direction: 'down' | 'right'): void
  insertRows(): void
  insertColumns(): void
  deleteRows(): void
  deleteColumns(): void
  merge(mode: 'center' | 'merge' | 'unmerge'): void
  toggleWrap(): void
  freeze(mode: FreezeMode): void
  sort(descending: boolean): void
  openSortDialog(): void
  toggleFilter(): void
  clearFilters(): void
  openFind(mode: 'find' | 'replace'): void
}

export type FreezeMode = 'selection' | 'firstRow' | 'firstColumn' | 'none'

const NUMBER_FORMATS: { label: string; value: NumberFormatKind }[] = [
  { label: 'General', value: 'general' },
  { label: 'Número', value: 'number' },
  { label: 'Moneda (€)', value: 'currency' },
  { label: 'Porcentaje', value: 'percent' },
  { label: 'Fecha', value: 'date' },
  { label: 'Texto', value: 'text' }
]

/** Funciones del menú "Insertar función", agrupadas como en la pestaña Fórmulas de Excel. */
const FUNCTION_GROUPS: { label: string; functions: { name: string; description: string }[] }[] = [
  {
    label: 'Matemáticas',
    functions: [
      { name: 'SUM', description: 'Suma los números de un rango' },
      { name: 'AVERAGE', description: 'Media de los números' },
      { name: 'MIN', description: 'El menor valor' },
      { name: 'MAX', description: 'El mayor valor' },
      { name: 'ROUND', description: 'Redondea a N decimales' },
      { name: 'ROUNDUP', description: 'Redondea alejándose del cero' },
      { name: 'ROUNDDOWN', description: 'Redondea hacia el cero' },
      { name: 'SUMIF', description: 'Suma las celdas que cumplen un criterio' },
      { name: 'SUMIFS', description: 'Suma las celdas que cumplen varios criterios' },
      { name: 'AVERAGEIF', description: 'Media de las celdas que cumplen un criterio' }
    ]
  },
  {
    label: 'Recuento',
    functions: [
      { name: 'COUNT', description: 'Cuenta las celdas con números' },
      { name: 'COUNTA', description: 'Cuenta las celdas no vacías' },
      { name: 'COUNTIF', description: 'Cuenta las celdas que cumplen un criterio' },
      { name: 'COUNTIFS', description: 'Cuenta las que cumplen varios criterios' },
      { name: 'COUNTBLANK', description: 'Cuenta las celdas vacías' }
    ]
  },
  {
    label: 'Lógicas',
    functions: [
      { name: 'IF', description: 'Un valor u otro según una condición' },
      { name: 'IFS', description: 'El valor de la primera condición que se cumple' },
      { name: 'IFERROR', description: 'Un valor alternativo si hay error' },
      { name: 'IFNA', description: 'Un valor alternativo si da #N/D' },
      { name: 'AND', description: 'VERDADERO si todo se cumple' },
      { name: 'OR', description: 'VERDADERO si algo se cumple' }
    ]
  },
  {
    label: 'Texto y búsqueda',
    functions: [
      { name: 'CONCAT', description: 'Une textos' },
      { name: 'LEN', description: 'Número de caracteres' },
      { name: 'UPPER', description: 'Pasa a mayúsculas' },
      { name: 'TEXT', description: 'Da formato a un número o una fecha' },
      { name: 'XLOOKUP', description: 'Busca un valor y devuelve el de otro rango' },
      { name: 'VLOOKUP', description: 'Busca un valor en la primera columna de una tabla' },
      { name: 'INDEX', description: 'El valor de una fila y columna de un rango' },
      { name: 'MATCH', description: 'La posición de un valor en un rango' }
    ]
  },
  {
    label: 'Fecha',
    functions: [
      { name: 'TODAY', description: 'La fecha de hoy' },
      { name: 'NOW', description: 'La fecha y hora actuales' },
      { name: 'DATE', description: 'Una fecha a partir de año, mes y día' },
      { name: 'YEAR', description: 'El año de una fecha' },
      { name: 'MONTH', description: 'El mes de una fecha' },
      { name: 'DAY', description: 'El día de una fecha' }
    ]
  }
]

interface SheetsRibbonProps {
  tab: SheetsTabId
  /** Formato de la celda activa: decide qué botones aparecen pulsados. */
  activeStyle: CellStyle
  canDeleteSheet: boolean
  /** La celda activa está dentro de una combinada. */
  inMerge: boolean
  frozen: boolean
  hasFilter: boolean
  commands: SheetCommands
}

export function SheetsRibbon(props: SheetsRibbonProps) {
  const { tab, activeStyle, canDeleteSheet, inMerge, frozen, hasFilter, commands } = props
  if (tab === 'formulas') return <FormulasTab commands={commands} />
  if (tab === 'view') return <ViewTab commands={commands} frozen={frozen} />
  if (tab === 'data') return <DataTab commands={commands} hasFilter={hasFilter} />

  const align = activeStyle.align
  const setAlign = (value: HorizontalAlign) => commands.setStyle({ align: align === value ? undefined : value })
  const format = activeStyle.numberFormat?.kind ?? 'general'

  return (
    <>
      <RibbonGroup label="Fuente">
        <RibbonRow>
          <ToolButton
            label="Negrita (Ctrl/Cmd+B)"
            active={activeStyle.bold}
            onClick={() => commands.toggleStyle('bold')}
          >
            <Bold size={16} />
          </ToolButton>
          <ToolButton
            label="Cursiva (Ctrl/Cmd+I)"
            active={activeStyle.italic}
            onClick={() => commands.toggleStyle('italic')}
          >
            <Italic size={16} />
          </ToolButton>
          <ToolButton
            label="Subrayado (Ctrl/Cmd+U)"
            active={activeStyle.underline}
            onClick={() => commands.toggleStyle('underline')}
          >
            <Underline size={16} />
          </ToolButton>
          <BordersMenu onSelect={commands.setBorders} />
        </RibbonRow>
        <RibbonRow>
          <ColorPicker
            label="Color de fuente"
            icon={<Baseline size={16} />}
            value={activeStyle.color ?? null}
            onChange={(color) => commands.setStyle({ color })}
            onClear={() => commands.setStyle({ color: undefined })}
            clearLabel="Automático"
          />
          <ColorPicker
            label="Color de relleno"
            icon={<PaintBucket size={16} />}
            value={activeStyle.fill ?? null}
            onChange={(fill) => commands.setStyle({ fill })}
            onClear={() => commands.setStyle({ fill: undefined })}
            clearLabel="Sin relleno"
          />
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Alineación">
        <RibbonRow>
          <ToolButton label="Alinear a la izquierda" active={align === 'left'} onClick={() => setAlign('left')}>
            <AlignLeft size={16} />
          </ToolButton>
          <ToolButton label="Centrar" active={align === 'center'} onClick={() => setAlign('center')}>
            <AlignCenter size={16} />
          </ToolButton>
          <ToolButton label="Alinear a la derecha" active={align === 'right'} onClick={() => setAlign('right')}>
            <AlignRight size={16} />
          </ToolButton>
        </RibbonRow>
        <RibbonRow>
          <ToolButton label="Ajustar texto" active={activeStyle.wrap} onClick={commands.toggleWrap}>
            <WrapText size={16} />
          </ToolButton>
          <ToolButton
            label={inMerge ? 'Separar celdas' : 'Combinar y centrar'}
            active={inMerge}
            onClick={() => commands.merge(inMerge ? 'unmerge' : 'center')}
          >
            <TableCellsMerge size={16} />
          </ToolButton>
          <Dropdown label="Más opciones de combinar" trigger={<ChevronDown size={12} />}>
            {(close) => (
              <>
                <MenuItem
                  onSelect={() => {
                    commands.merge('center')
                    close()
                  }}
                >
                  <TableCellsMerge size={14} /> Combinar y centrar
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    commands.merge('merge')
                    close()
                  }}
                >
                  <TableCellsMerge size={14} /> Combinar celdas
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    commands.merge('unmerge')
                    close()
                  }}
                >
                  <TableCellsSplit size={14} /> Separar celdas
                </MenuItem>
              </>
            )}
          </Dropdown>
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Número">
        <RibbonRow>
          <SelectField
            label="Formato de número"
            value={format}
            options={NUMBER_FORMATS}
            onChange={(value) => commands.setNumberFormat(value as NumberFormatKind)}
            width={130}
          />
        </RibbonRow>
        <RibbonRow>
          <ToolButton label="Aumentar decimales" onClick={() => commands.changeDecimals(1)}>
            <DecimalsArrowRight size={16} />
          </ToolButton>
          <ToolButton label="Disminuir decimales" onClick={() => commands.changeDecimals(-1)}>
            <DecimalsArrowLeft size={16} />
          </ToolButton>
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Celdas">
        <div className="ribbon-stack">
          <Dropdown label="Insertar" showLabel trigger={<BetweenHorizontalStart size={14} />}>
            {(close) => (
              <>
                <MenuItem
                  onSelect={() => {
                    commands.insertRows()
                    close()
                  }}
                >
                  <BetweenHorizontalStart size={14} /> Insertar filas encima
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    commands.insertColumns()
                    close()
                  }}
                >
                  <BetweenVerticalStart size={14} /> Insertar columnas a la izquierda
                </MenuItem>
              </>
            )}
          </Dropdown>
          <Dropdown label="Eliminar" showLabel trigger={<TableRowsSplit size={14} />}>
            {(close) => (
              <>
                <MenuItem
                  onSelect={() => {
                    commands.deleteRows()
                    close()
                  }}
                >
                  <Rows3 size={14} /> Eliminar filas
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    commands.deleteColumns()
                    close()
                  }}
                >
                  <Columns3 size={14} /> Eliminar columnas
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Edición">
        <ToolButton label="Autosuma" large onClick={commands.autoSum}>
          <Sigma size={22} />
        </ToolButton>
        <div className="ribbon-stack">
          <ToolButton label="Rellenar abajo" showLabel onClick={() => commands.fill('down')}>
            <ArrowDownToLine size={14} />
          </ToolButton>
          <ToolButton label="Rellenar derecha" showLabel onClick={() => commands.fill('right')}>
            <ArrowRightToLine size={14} />
          </ToolButton>
          <ToolButton label="Buscar" showLabel onClick={() => commands.openFind('find')}>
            <Search size={14} />
          </ToolButton>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Hojas">
        <ToolButton label="Nueva hoja" large onClick={commands.addSheet}>
          <Plus size={22} />
        </ToolButton>
        <div className="ribbon-stack">
          <ToolButton label="Cambiar nombre" showLabel onClick={commands.renameActiveSheet}>
            <Pencil size={14} />
          </ToolButton>
          <ToolButton label="Eliminar hoja" showLabel disabled={!canDeleteSheet} onClick={commands.deleteActiveSheet}>
            <Trash2 size={14} />
          </ToolButton>
        </div>
      </RibbonGroup>
    </>
  )
}

function BordersMenu({ onSelect }: { onSelect(mode: BorderMode): void }) {
  const options: { mode: BorderMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'all', label: 'Todos los bordes', icon: <Grid2x2 size={14} /> },
    { mode: 'outside', label: 'Bordes externos', icon: <Square size={14} /> },
    { mode: 'bottom', label: 'Borde inferior', icon: <PanelBottom size={14} /> },
    { mode: 'none', label: 'Sin bordes', icon: <Grid2x2X size={14} /> }
  ]
  return (
    <Dropdown label="Bordes" trigger={<Grid2x2 size={16} />}>
      {(close) =>
        options.map((option) => (
          <MenuItem
            key={option.mode}
            onSelect={() => {
              onSelect(option.mode)
              close()
            }}
          >
            {option.icon} {option.label}
          </MenuItem>
        ))
      }
    </Dropdown>
  )
}

function FormulasTab({ commands }: { commands: SheetCommands }) {
  return (
    <>
      <RibbonGroup label="Biblioteca de funciones">
        <ToolButton label="Autosuma" large onClick={commands.autoSum}>
          <Sigma size={22} />
        </ToolButton>
        <Dropdown label="Insertar función" large trigger={<SquareFunction size={22} />}>
          {(close) => (
            <div className="function-menu">
              {FUNCTION_GROUPS.map((group) => (
                <div key={group.label} className="function-menu__group">
                  <div className="function-menu__label">{group.label}</div>
                  {group.functions.map((fn) => (
                    <MenuItem
                      key={fn.name}
                      onSelect={() => {
                        commands.insertFunction(fn.name)
                        close()
                      }}
                    >
                      <b>{localizedFunctionName(fn.name)}</b>
                      <span className="function-menu__description">{fn.description}</span>
                    </MenuItem>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Dropdown>
      </RibbonGroup>
      <RibbonGroup label="Ayuda">
        <div className="ribbon-note">
          Escribe <code>=</code> para empezar una fórmula. Separa los argumentos con <code>;</code> y usa el punto para
          los decimales dentro de las fórmulas: <code>=REDONDEAR(A1*1.21;2)</code>. Mientras escribes, haz clic en una
          celda para insertar su referencia.
        </div>
      </RibbonGroup>
    </>
  )
}
