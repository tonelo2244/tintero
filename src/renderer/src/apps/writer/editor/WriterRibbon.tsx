import type { ChangeEvent } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CalendarDays,
  ClipboardPaste,
  Code2,
  Copy,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  RemoveFormatting,
  Scissors,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
  Underline,
  UnfoldVertical
} from 'lucide-react'
import { ColorPicker } from '@/ui/ColorPicker'
import { FONT_FAMILIES, FONT_SIZES, nextFontSize } from '@/ui/fonts'
import { Dropdown, MenuItem, RibbonGroup, RibbonRow, SelectField, ToolButton } from '@/ui/Ribbon'
import { readImageFile } from '@/ui/readImageFile'
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE_PT } from '../constants'
import { PARAGRAPH_STYLES } from '../model/paragraphStyles'
import type { TextAlignment, WriterToolbarState } from './useWriterToolbarState'

const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3']

const ALIGN_BUTTONS: { value: TextAlignment; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Alinear a la izquierda', Icon: AlignLeft },
  { value: 'center', label: 'Centrar', Icon: AlignCenter },
  { value: 'right', label: 'Alinear a la derecha', Icon: AlignRight },
  { value: 'justify', label: 'Justificar', Icon: AlignJustify }
]

const parsePt = (value: string | null) => (value ? parseFloat(value) : DEFAULT_FONT_SIZE_PT)

interface HomeTabProps {
  editor: Editor
  state: WriterToolbarState
  showMarks: boolean
  onToggleMarks(): void
}

export function WriterHomeTab({ editor, state, showMarks, onToggleMarks }: HomeTabProps) {
  const chain = () => editor.chain().focus()
  const fontSize = parsePt(state.fontSize)

  const paste = async () => {
    editor.commands.focus()
    // En Electron execCommand('paste') respeta el formato; si no está disponible, pegamos texto plano.
    if (!document.execCommand('paste')) {
      const text = await navigator.clipboard.readText()
      editor.commands.insertContent(text)
    }
  }

  return (
    <>
      <RibbonGroup label="Portapapeles">
        <ToolButton label="Pegar" large onClick={() => void paste()}>
          <ClipboardPaste size={22} />
        </ToolButton>
        <div className="ribbon-stack">
          <ToolButton label="Cortar" onClick={() => document.execCommand('cut')}>
            <Scissors size={15} />
          </ToolButton>
          <ToolButton label="Copiar" onClick={() => document.execCommand('copy')}>
            <Copy size={15} />
          </ToolButton>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Fuente">
        <RibbonRow>
          <SelectField
            label="Fuente"
            value={state.fontFamily ?? DEFAULT_FONT_FAMILY}
            options={FONT_FAMILIES}
            onChange={(value) => chain().setFontFamily(value).run()}
          />
          <SelectField
            label="Tamaño de fuente"
            width={58}
            value={String(fontSize)}
            options={FONT_SIZES.map((size) => ({ label: String(size), value: String(size) }))}
            onChange={(value) => chain().setFontSize(`${value}pt`).run()}
          />
          <ToolButton label="Aumentar tamaño" onClick={() => chain().setFontSize(`${nextFontSize(fontSize, 1)}pt`).run()}>
            <AArrowUp size={16} />
          </ToolButton>
          <ToolButton label="Disminuir tamaño" onClick={() => chain().setFontSize(`${nextFontSize(fontSize, -1)}pt`).run()}>
            <AArrowDown size={16} />
          </ToolButton>
          <ToolButton label="Borrar formato" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
            <RemoveFormatting size={16} />
          </ToolButton>
        </RibbonRow>
        <RibbonRow>
          <ToolButton label="Negrita (Ctrl/Cmd+B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
            <Bold size={16} />
          </ToolButton>
          <ToolButton label="Cursiva (Ctrl/Cmd+I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
            <Italic size={16} />
          </ToolButton>
          <ToolButton label="Subrayado (Ctrl/Cmd+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
            <Underline size={16} />
          </ToolButton>
          <ToolButton label="Tachado" active={state.strike} onClick={() => chain().toggleStrike().run()}>
            <Strikethrough size={16} />
          </ToolButton>
          <ToolButton label="Subíndice" active={state.subscript} onClick={() => chain().unsetSuperscript().toggleSubscript().run()}>
            <Subscript size={16} />
          </ToolButton>
          <ToolButton label="Superíndice" active={state.superscript} onClick={() => chain().unsetSubscript().toggleSuperscript().run()}>
            <Superscript size={16} />
          </ToolButton>
          <ColorPicker
            label="Color de resaltado"
            icon={<Highlighter size={16} />}
            value={state.highlight ?? '#fff176'}
            clearLabel="Sin color"
            onChange={(color) => chain().setHighlight({ color }).run()}
            onClear={() => chain().unsetHighlight().run()}
          />
          <ColorPicker
            label="Color de fuente"
            icon={<Type size={16} />}
            value={state.color ?? '#c0392b'}
            clearLabel="Automático"
            onChange={(color) => chain().setColor(color).run()}
            onClear={() => chain().unsetColor().run()}
          />
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Párrafo">
        <RibbonRow>
          <ToolButton label="Viñetas" active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
            <List size={16} />
          </ToolButton>
          <ToolButton label="Numeración" active={state.orderedList} onClick={() => chain().toggleOrderedList().run()}>
            <ListOrdered size={16} />
          </ToolButton>
          <ToolButton label="Disminuir sangría" onClick={() => chain().outdent().run()}>
            <IndentDecrease size={16} />
          </ToolButton>
          <ToolButton label="Aumentar sangría" onClick={() => chain().indent().run()}>
            <IndentIncrease size={16} />
          </ToolButton>
          <ToolButton label="Mostrar marcas de párrafo" active={showMarks} onClick={onToggleMarks}>
            <Pilcrow size={16} />
          </ToolButton>
        </RibbonRow>
        <RibbonRow>
          {ALIGN_BUTTONS.map(({ value, label, Icon }) => (
            <ToolButton
              key={value}
              label={label}
              active={state.align === value}
              onClick={() => chain().setTextAlign(value).run()}
            >
              <Icon size={16} />
            </ToolButton>
          ))}
          <Dropdown label="Interlineado" trigger={<UnfoldVertical size={16} />}>
            {(close) =>
              LINE_HEIGHTS.map((value) => (
                <MenuItem
                  key={value}
                  onSelect={() => {
                    chain().setLineHeight(value).run()
                    close()
                  }}
                >
                  {state.lineHeight === value ? '✓ ' : ''}
                  {value.replace('.', ',')}
                </MenuItem>
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
              className={`style-card ${state.paragraphStyleId === style.id ? 'is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => style.apply(editor)}
              title={style.label}
            >
              <span className={`style-preview ${style.previewClass}`}>AaBbCc</span>
              <span className="style-card__label">{style.label}</span>
            </button>
          ))}
        </div>
      </RibbonGroup>
    </>
  )
}

export function WriterInsertTab({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus()

  const insertImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const src = await readImageFile(file)
    chain().setImage({ src, alt: file.name }).run()
  }

  const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <RibbonGroup label="Ilustraciones">
        <label className="tool-button tool-button--large" title="Insertar imagen desde el disco">
          <ImagePlus size={22} />
          <span className="tool-button__label">Imagen</span>
          <input type="file" accept="image/*" hidden onChange={(event) => void insertImage(event)} />
        </label>
      </RibbonGroup>
      <RibbonGroup label="Elementos">
        <ToolButton label="Línea horizontal" large onClick={() => chain().setHorizontalRule().run()}>
          <Minus size={22} />
        </ToolButton>
        <ToolButton label="Fecha" large onClick={() => chain().insertContent(today).run()}>
          <CalendarDays size={22} />
        </ToolButton>
        <ToolButton label="Cita" large onClick={() => chain().toggleBlockquote().run()}>
          <Quote size={22} />
        </ToolButton>
        <ToolButton label="Bloque de código" large onClick={() => chain().toggleCodeBlock().run()}>
          <Code2 size={22} />
        </ToolButton>
      </RibbonGroup>
    </>
  )
}
