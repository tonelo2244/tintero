import {
  AArrowDown,
  ArrowDownAZ,
  CaseSensitive,
  ListTree,
  PaintBucket,
  Paintbrush,
  SquareDashed,
  TextSelect,
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
import { commandLabel, commandState, runCommand, type TextAlignment } from '../../model/commands'
import { BULLET_STYLES, NUMBER_FORMATS, PARAGRAPH_BORDERS } from '../../model/paragraphFormat'
import { CASE_MODES } from '../../model/textCase'
import type { WriterToolbarState } from '../useWriterToolbarState'
import { CommandButton, CommandMenuItem } from './CommandButton'
import { useCommandContext } from './commandContext'
import { StyleGallery } from './StyleGallery'

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
        <Dropdown label="Pegar" large trigger={<ClipboardPaste size={22} />}>
          {(close) => (
            <>
              <CommandMenuItem command="paste" onDone={close}>
                Mantener formato de origen
              </CommandMenuItem>
              <CommandMenuItem command="pasteText" onDone={close}>
                Mantener solo texto
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
        <div className="ribbon-stack">
          <CommandButton command="cut" icon={<Scissors size={15} />} />
          <CommandButton command="copy" icon={<Copy size={15} />} />
          <FormatPainterButton />
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
          <Dropdown label="Cambiar mayúsculas y minúsculas" trigger={<CaseSensitive size={16} />}>
            {(close) =>
              CASE_MODES.map((mode) => (
                <CommandMenuItem key={mode.id} command="changeCase" arg={mode.id} onDone={close}>
                  {mode.label}
                </CommandMenuItem>
              ))
            }
          </Dropdown>
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
          <Dropdown label="Biblioteca de viñetas" trigger={<span className="dropdown__spacer" />}>
            {(close) =>
              BULLET_STYLES.map((bullet) => (
                <CommandMenuItem key={bullet.id} command="bulletStyle" arg={bullet.id} onDone={close}>
                  <span className="list-option__symbol">{bullet.symbol}</span>
                  {bullet.label}
                </CommandMenuItem>
              ))
            }
          </Dropdown>
          <CommandButton command="orderedList" icon={<ListOrdered size={16} />} />
          <Dropdown label="Formato de número" trigger={<span className="dropdown__spacer" />}>
            {(close) => (
              <>
                {NUMBER_FORMATS.map((format) => (
                  <CommandMenuItem key={format.id} command="numberFormat" arg={format.id} onDone={close}>
                    {format.label}
                  </CommandMenuItem>
                ))}
                <hr className="menu-separator" />
                <CommandMenuItem command="restartNumbering" onDone={close}>
                  Reiniciar en 1
                </CommandMenuItem>
                <CommandMenuItem command="continueNumbering" onDone={close}>
                  Continuar numeración
                </CommandMenuItem>
              </>
            )}
          </Dropdown>
          <Dropdown label="Lista multinivel" trigger={<ListTree size={16} />}>
            {(close) => (
              <CommandMenuItem command="numberedHeadings" onDone={close}>
                {commandLabel('numberedHeadings').label}
              </CommandMenuItem>
            )}
          </Dropdown>
          <CommandButton command="outdent" icon={<IndentDecrease size={16} />} />
          <CommandButton command="indent" icon={<IndentIncrease size={16} />} />
          <Dropdown label="Ordenar" trigger={<ArrowDownAZ size={16} />}>
            {(close) => (
              <>
                <CommandMenuItem command="sortParagraphs" arg="asc" onDone={close}>
                  De la A a la Z
                </CommandMenuItem>
                <CommandMenuItem command="sortParagraphs" arg="desc" onDone={close}>
                  De la Z a la A
                </CommandMenuItem>
              </>
            )}
          </Dropdown>
          <CommandButton command="toggleMarks" icon={<Pilcrow size={16} />} />
        </RibbonRow>
        <RibbonRow>
          {ALIGN_BUTTONS.map(({ value, label, Icon }) => (
            <CommandButton key={value} command="textAlign" arg={value} label={label} icon={<Icon size={16} />} />
          ))}
          <Dropdown label="Interlineado y espaciado" trigger={<UnfoldVertical size={16} />}>
            {(close) => (
              <>
                {LINE_HEIGHTS.map((value) => (
                  <CommandMenuItem key={value} command="lineHeight" arg={value} onDone={close}>
                    {value.replace('.', ',')}
                  </CommandMenuItem>
                ))}
                <hr className="menu-separator" />
                <CommandMenuItem command="toggleSpaceBefore" onDone={close}>
                  {commandLabel('toggleSpaceBefore').label}
                </CommandMenuItem>
                <CommandMenuItem command="toggleSpaceAfter" onDone={close}>
                  {commandLabel('toggleSpaceAfter').label}
                </CommandMenuItem>
              </>
            )}
          </Dropdown>
          <ColorPicker
            label="Sombreado"
            icon={<PaintBucket size={16} />}
            value={state.shading ?? '#fff2cc'}
            clearLabel="Sin color"
            onChange={(color) => runCommand(context, 'shading', color)}
            onClear={() => runCommand(context, 'shading', null)}
          />
          <Dropdown label="Bordes" trigger={<SquareDashed size={16} />}>
            {(close) =>
              PARAGRAPH_BORDERS.map((border) => (
                <CommandMenuItem key={border.id} command="paragraphBorder" arg={border.id} onDone={close}>
                  {border.label}
                </CommandMenuItem>
              ))
            }
          </Dropdown>
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Estilos">
        <StyleGallery />
      </RibbonGroup>

      <RibbonGroup label="Edición">
        <div className="ribbon-stack">
          <CommandButton command="find" showLabel icon={<Search size={15} />} />
          <CommandButton command="replace" showLabel icon={<Replace size={15} />} />
          <Dropdown label="Seleccionar" showLabel trigger={<TextSelect size={15} />}>
            {(close) => (
              <>
                <CommandMenuItem command="selectAll" onDone={close}>
                  Seleccionar todo
                </CommandMenuItem>
                <CommandMenuItem command="selectParagraph" onDone={close}>
                  Seleccionar el párrafo
                </CommandMenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </RibbonGroup>
    </>
  )
}

/**
 * Copiar formato: un clic lo copia para una sola vez; doble clic lo deja puesto hasta pulsar Esc o
 * volver a pulsar el botón (como la brocha de Word).
 */
function FormatPainterButton() {
  const context = useCommandContext()
  const { active } = commandState(context, 'formatPainter', false)
  return (
    <button
      type="button"
      className={`tool-button ${active ? 'is-active' : ''}`}
      title="Copiar formato (doble clic: varias veces)"
      aria-label="Copiar formato"
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        // El segundo clic de un doble clic lo resuelve onDoubleClick.
        if (event.detail < 2) runCommand(context, 'formatPainter', false)
      }}
      onDoubleClick={() => runCommand(context, 'formatPainter', true)}
    >
      <Paintbrush size={15} />
    </button>
  )
}
