import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ClipboardPaste,
  Copy,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  RemoveFormatting,
  Replace,
  Scissors,
  Search,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
  Underline,
  UnfoldVertical
} from 'lucide-react'
import { ColorPicker } from '@/ui/ColorPicker'
import { FONT_FAMILIES, FONT_SIZES } from '@/ui/fonts'
import { Dropdown, RibbonGroup, RibbonRow, SelectField } from '@/ui/Ribbon'
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE_PT } from '../../constants'
import { commandState, runCommand, type TextAlignment } from '../../model/commands'
import { PARAGRAPH_STYLES } from '../../model/paragraphStyles'
import type { WriterToolbarState } from '../useWriterToolbarState'
import { CommandButton, CommandMenuItem } from './CommandButton'
import { useCommandContext } from './commandContext'

const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3']

const ALIGN_BUTTONS: { value: TextAlignment; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Alinear a la izquierda', Icon: AlignLeft },
  { value: 'center', label: 'Centrar', Icon: AlignCenter },
  { value: 'right', label: 'Alinear a la derecha', Icon: AlignRight },
  { value: 'justify', label: 'Justificar', Icon: AlignJustify }
]

const parsePt = (value: string | null) => (value ? parseFloat(value) : DEFAULT_FONT_SIZE_PT)

/** Pestaña Inicio: portapapeles, fuente, párrafo, estilos y edición. */
export function HomeTab({ state }: { state: WriterToolbarState }) {
  const context = useCommandContext()
  const fontSize = parsePt(state.fontSize)

  return (
    <>
      <RibbonGroup label="Portapapeles">
        <CommandButton command="paste" large icon={<ClipboardPaste size={22} />} />
        <div className="ribbon-stack">
          <CommandButton command="cut" icon={<Scissors size={15} />} />
          <CommandButton command="copy" icon={<Copy size={15} />} />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Fuente">
        <RibbonRow>
          <SelectField
            label="Fuente"
            value={state.fontFamily ?? DEFAULT_FONT_FAMILY}
            options={FONT_FAMILIES}
            onChange={(value) => runCommand(context, 'fontFamily', value)}
          />
          <SelectField
            label="Tamaño de fuente"
            width={58}
            value={String(fontSize)}
            options={FONT_SIZES.map((size) => ({ label: String(size), value: String(size) }))}
            onChange={(value) => runCommand(context, 'fontSize', Number(value))}
          />
          <CommandButton command="growFont" icon={<AArrowUp size={16} />} />
          <CommandButton command="shrinkFont" icon={<AArrowDown size={16} />} />
          <CommandButton command="clearFormatting" icon={<RemoveFormatting size={16} />} />
        </RibbonRow>
        <RibbonRow>
          <CommandButton command="bold" icon={<Bold size={16} />} />
          <CommandButton command="italic" icon={<Italic size={16} />} />
          <CommandButton command="underline" icon={<Underline size={16} />} />
          <CommandButton command="strike" icon={<Strikethrough size={16} />} />
          <CommandButton command="subscript" icon={<Subscript size={16} />} />
          <CommandButton command="superscript" icon={<Superscript size={16} />} />
          <ColorPicker
            label="Color de resaltado"
            icon={<Highlighter size={16} />}
            value={state.highlight ?? '#fff176'}
            clearLabel="Sin color"
            onChange={(color) => runCommand(context, 'highlight', color)}
            onClear={() => runCommand(context, 'highlight', null)}
          />
          <ColorPicker
            label="Color de fuente"
            icon={<Type size={16} />}
            value={state.color ?? '#c0392b'}
            clearLabel="Automático"
            onChange={(color) => runCommand(context, 'fontColor', color)}
            onClear={() => runCommand(context, 'fontColor', null)}
          />
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Párrafo">
        <RibbonRow>
          <CommandButton command="bulletList" icon={<List size={16} />} />
          <CommandButton command="orderedList" icon={<ListOrdered size={16} />} />
          <CommandButton command="outdent" icon={<IndentDecrease size={16} />} />
          <CommandButton command="indent" icon={<IndentIncrease size={16} />} />
          <CommandButton command="toggleMarks" icon={<Pilcrow size={16} />} />
        </RibbonRow>
        <RibbonRow>
          {ALIGN_BUTTONS.map(({ value, label, Icon }) => (
            <CommandButton key={value} command="textAlign" arg={value} label={label} icon={<Icon size={16} />} />
          ))}
          <Dropdown label="Interlineado" trigger={<UnfoldVertical size={16} />}>
            {(close) =>
              LINE_HEIGHTS.map((value) => (
                <CommandMenuItem key={value} command="lineHeight" arg={value} onDone={close}>
                  {value.replace('.', ',')}
                </CommandMenuItem>
              ))
            }
          </Dropdown>
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Estilos">
        <div className="style-gallery">
          {PARAGRAPH_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              className={`style-card ${commandState(context, 'applyStyle', style.id).active ? 'is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runCommand(context, 'applyStyle', style.id)}
              title={style.label}
            >
              <span className={`style-preview ${style.previewClass}`}>AaBbCc</span>
              <span className="style-card__label">{style.label}</span>
            </button>
          ))}
        </div>
      </RibbonGroup>

      <RibbonGroup label="Edición">
        <div className="ribbon-stack">
          <CommandButton command="find" showLabel icon={<Search size={15} />} />
          <CommandButton command="replace" showLabel icon={<Replace size={15} />} />
        </div>
      </RibbonGroup>
    </>
  )
}
