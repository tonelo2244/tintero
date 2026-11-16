import type { ChangeEvent } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  BringToFront,
  Bold,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Group,
  ImagePlus,
  Italic,
  List,
  PaintBucket,
  Pencil,
  Play,
  PlaySquare,
  SendToBack,
  Shapes,
  Sparkles,
  SquarePlus,
  Strikethrough,
  RotateCcw,
  RotateCcwSquare,
  RotateCw,
  Scissors,
  Trash2,
  Type,
  TypeOutline,
  Underline,
  Ungroup
} from 'lucide-react'
import { ColorPicker } from '@/ui/ColorPicker'
import { TableGridPicker } from '@/ui/TableGridPicker'
import { FONT_FAMILIES, FONT_SIZES, nextFontSize } from '@/ui/fonts'
import { Dropdown, MenuItem, RibbonGroup, RibbonRow, SelectField, ToolButton } from '@/ui/Ribbon'
import type { AlignMode } from '../model/arrange'
import { SLIDE_LAYOUTS } from '../model/factories'
import { availableThemes, presentationTheme, type SlideTheme } from '../model/themes'
import type {
  HorizontalAlign,
  Presentation,
  ShapeKind,
  Slide,
  SlideElement,
  SlideTransition,
  VerticalAlign
} from '../model/types'
import { SHAPE_LABELS, ShapeIcon } from './ElementContent'
import { SlideView } from './SlideView'
import { useCharacterFormat } from './useCharacterFormat'
import { useParagraphFormat } from './useParagraphFormat'
import type { SlideCommands } from './useSlideCommands'

export type SlidesTabId = 'home' | 'insert' | 'design' | 'show' | 'assistant'

export const SLIDES_TABS: { id: SlidesTabId; label: string }[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'insert', label: 'Insertar' },
  { id: 'design', label: 'Diseño' },
  { id: 'show', label: 'Presentación' },
  { id: 'assistant', label: 'Asistente' }
]

interface SlidesRibbonProps {
  tab: SlidesTabId
  presentation: Presentation
  currentSlide: Slide
  selectedElement: SlideElement | null
  /** Cuántos elementos hay seleccionados (con varios, solo se puede organizar). */
  selectedCount: number
  /** Editor del cuadro de texto en el que se está escribiendo, si lo hay (formato por palabra). */
  textEditor: Editor | null
  commands: SlideCommands
  onStartSlideshow(fromStart: boolean): void
}

export function SlidesRibbon({ tab, ...props }: SlidesRibbonProps) {
  switch (tab) {
    case 'home':
      return (
        <>
          <ClipboardGroup selectedCount={props.selectedCount} commands={props.commands} />
          <SlidesGroup commands={props.commands} />
          <TextGroups
            selectedElement={props.selectedElement}
            textEditor={props.textEditor}
            commands={props.commands}
            theme={presentationTheme(props.presentation)}
          />
          <DrawingGroup
            selectedElement={props.selectedElement}
            selectedCount={props.selectedCount}
            commands={props.commands}
          />
        </>
      )
    case 'insert':
      return (
        <>
          <SlidesGroup commands={props.commands} />
          <InsertGroup commands={props.commands} />
        </>
      )
    case 'design':
      return (
        <>
          <ThemeGallery presentation={props.presentation} currentSlide={props.currentSlide} commands={props.commands} />
          <TransitionGroup currentSlide={props.currentSlide} commands={props.commands} />
        </>
      )
    case 'show':
      return (
        <RibbonGroup label="Iniciar presentación">
          <ToolButton label="Desde el principio" large onClick={() => props.onStartSlideshow(true)}>
            <Play size={22} />
          </ToolButton>
          <ToolButton label="Desde la actual" large onClick={() => props.onStartSlideshow(false)}>
            <PlaySquare size={22} />
          </ToolButton>
        </RibbonGroup>
      )
    case 'assistant':
      // La pestaña Asistente la pinta SlidesEditor (necesita el estado de la IA).
      return null
  }
}

function SlidesGroup({ commands }: { commands: SlideCommands }) {
  return (
    <RibbonGroup label="Diapositivas">
      <Dropdown label="Nueva diapositiva" large trigger={<SquarePlus size={22} />}>
        {(close) =>
          SLIDE_LAYOUTS.map((layout) => (
            <MenuItem
              key={layout.id}
              onSelect={() => {
                commands.addSlide(layout.id)
                close()
              }}
            >
              {layout.name}
            </MenuItem>
          ))
        }
      </Dropdown>
      <div className="ribbon-stack">
        <ToolButton label="Duplicar" showLabel onClick={() => commands.duplicateSlide()}>
          <Copy size={14} />
        </ToolButton>
        <ToolButton label="Eliminar" showLabel onClick={() => commands.deleteSlide()}>
          <Trash2 size={14} />
        </ToolButton>
      </div>
    </RibbonGroup>
  )
}

const H_ALIGN: { value: HorizontalAlign; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'left', label: 'Alinear a la izquierda', Icon: AlignLeft },
  { value: 'center', label: 'Centrar', Icon: AlignCenter },
  { value: 'right', label: 'Alinear a la derecha', Icon: AlignRight },
  { value: 'justify', label: 'Justificar', Icon: AlignJustify }
]

const V_ALIGN: { value: VerticalAlign; label: string; Icon: typeof AlignLeft }[] = [
  { value: 'top', label: 'Alinear arriba', Icon: AlignVerticalJustifyStart },
  { value: 'middle', label: 'Alinear en el medio', Icon: AlignVerticalJustifyCenter },
  { value: 'bottom', label: 'Alinear abajo', Icon: AlignVerticalJustifyEnd }
]

function TextGroups({
  selectedElement,
  textEditor,
  commands,
  theme
}: {
  selectedElement: SlideElement | null
  textEditor: Editor | null
  commands: SlideCommands
  theme: SlideTheme
}) {
  const text = selectedElement?.type === 'text' ? selectedElement : null
  const disabled = !text
  const style = text?.style
  const defaultFont = text?.role === 'title' ? theme.titleFontFamily : theme.fontFamily
  const character = useCharacterFormat(textEditor, text, commands)
  const paragraph = useParagraphFormat(textEditor, text, commands)
  const format = character.format
  const fontSize = format?.fontSize ?? 24

  return (
    <>
      <RibbonGroup label="Fuente">
        <RibbonRow>
          <SelectField
            label="Fuente"
            disabled={disabled}
            value={format?.fontFamily ?? defaultFont}
            options={FONT_FAMILIES}
            onChange={character.setFontFamily}
          />
          <SelectField
            label="Tamaño de fuente"
            width={58}
            disabled={disabled}
            value={String(fontSize)}
            options={FONT_SIZES.map((size) => ({ label: String(size), value: String(size) }))}
            onChange={(value) => character.setFontSize(Number(value))}
          />
          <ToolButton
            label="Aumentar tamaño"
            disabled={disabled}
            onClick={() => character.setFontSize(nextFontSize(fontSize, 1))}
          >
            <AArrowUp size={16} />
          </ToolButton>
          <ToolButton
            label="Disminuir tamaño"
            disabled={disabled}
            onClick={() => character.setFontSize(nextFontSize(fontSize, -1))}
          >
            <AArrowDown size={16} />
          </ToolButton>
        </RibbonRow>
        <RibbonRow>
          <ToolButton
            label="Negrita"
            disabled={disabled}
            active={format?.bold}
            onClick={() => character.toggle('bold')}
          >
            <Bold size={16} />
          </ToolButton>
          <ToolButton
            label="Cursiva"
            disabled={disabled}
            active={format?.italic}
            onClick={() => character.toggle('italic')}
          >
            <Italic size={16} />
          </ToolButton>
          <ToolButton
            label="Subrayado"
            disabled={disabled}
            active={format?.underline}
            onClick={() => character.toggle('underline')}
          >
            <Underline size={16} />
          </ToolButton>
          <ToolButton
            label="Tachado"
            disabled={disabled}
            active={format?.strike}
            onClick={() => character.toggle('strike')}
          >
            <Strikethrough size={16} />
          </ToolButton>
          <ColorPicker
            label="Color de fuente"
            icon={<Type size={16} />}
            disabled={disabled}
            value={format?.color ?? null}
            clearLabel="Color del tema"
            onChange={character.setColor}
            onClear={() => character.setColor(null)}
          />
        </RibbonRow>
      </RibbonGroup>

      <RibbonGroup label="Párrafo">
        <RibbonRow>
          {H_ALIGN.map(({ value, label, Icon }) => (
            <ToolButton
              key={value}
              label={label}
              disabled={disabled}
              active={paragraph.format?.align === value}
              onClick={() => paragraph.setAlign(value)}
            >
              <Icon size={16} />
            </ToolButton>
          ))}
        </RibbonRow>
        <RibbonRow>
          <ToolButton
            label="Viñetas"
            disabled={disabled}
            active={paragraph.format?.bullets}
            onClick={paragraph.toggleBullets}
          >
            <List size={16} />
          </ToolButton>
          {V_ALIGN.map(({ value, label, Icon }) => (
            <ToolButton
              key={value}
              label={label}
              disabled={disabled}
              active={style?.verticalAlign === value}
              onClick={() => commands.setTextStyle({ verticalAlign: value })}
            >
              <Icon size={16} />
            </ToolButton>
          ))}
        </RibbonRow>
      </RibbonGroup>
    </>
  )
}

function ShapePicker({ commands, large }: { commands: SlideCommands; large?: boolean }) {
  return (
    <Dropdown label="Formas" large={large} trigger={<Shapes size={large ? 22 : 16} />}>
      {(close) => (
        <div className="shape-picker">
          {(Object.keys(SHAPE_LABELS) as ShapeKind[]).map((shape) => (
            <button
              key={shape}
              type="button"
              className="shape-picker__item"
              title={SHAPE_LABELS[shape]}
              onClick={() => {
                commands.insertShape(shape)
                close()
              }}
            >
              <ShapeIcon shape={shape} />
            </button>
          ))}
        </div>
      )}
    </Dropdown>
  )
}

function ImageButton({ commands }: { commands: SlideCommands }) {
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void commands.insertImage(file).catch((error: Error) => window.alert(error.message))
  }
  return (
    <label className="tool-button tool-button--large" title="Insertar imagen desde el disco">
      <ImagePlus size={22} />
      <span className="tool-button__label">Imagen</span>
      <input type="file" accept="image/*" hidden onChange={onFile} />
    </label>
  )
}

function InsertGroup({ commands }: { commands: SlideCommands }) {
  return (
    <RibbonGroup label="Insertar">
      <ImageButton commands={commands} />
      <ShapePicker commands={commands} large />
      <ToolButton label="Cuadro de texto" large onClick={commands.insertTextBox}>
        <TypeOutline size={22} />
      </ToolButton>
      <TableGridPicker onInsert={({ rows, cols }) => commands.insertTable(rows, cols)} />
    </RibbonGroup>
  )
}

const ALIGN_OPTIONS: { mode: AlignMode; label: string; Icon: typeof AlignLeft }[] = [
  { mode: 'left', label: 'Alinear objetos a la izquierda', Icon: AlignStartVertical },
  { mode: 'center', label: 'Centrar objetos', Icon: AlignCenterVertical },
  { mode: 'right', label: 'Alinear objetos a la derecha', Icon: AlignEndVertical },
  { mode: 'top', label: 'Alinear objetos arriba', Icon: AlignStartHorizontal },
  { mode: 'middle', label: 'Alinear objetos al medio', Icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Alinear objetos abajo', Icon: AlignEndHorizontal }
]

/**
 * Menú "Organizar", como el de PowerPoint en Inicio: orden, grupos, alineación y giro en un solo
 * botón. Así la pestaña cabe en una ventana normal sin barra de desplazamiento.
 */
function ArrangeMenu({
  selectedElement,
  selectedCount,
  commands
}: {
  selectedElement: SlideElement | null
  selectedCount: number
  commands: SlideCommands
}) {
  const one = selectedElement !== null
  return (
    <Dropdown label="Organizar" large disabled={selectedCount === 0} trigger={<BringToFront size={22} />}>
      {(close) => {
        const item = (label: string, Icon: typeof AlignLeft, run: () => void, disabled = false) => (
          <MenuItem
            key={label}
            disabled={disabled}
            onSelect={() => {
              run()
              close()
            }}
          >
            <Icon size={15} /> {label}
          </MenuItem>
        )
        return (
          <div className="arrange-menu">
            <div className="arrange-menu__title">Ordenar</div>
            {item('Traer al frente', BringToFront, () => commands.reorderSelected('front'), !one)}
            {item('Enviar al fondo', SendToBack, () => commands.reorderSelected('back'), !one)}
            <div className="arrange-menu__title">Agrupar</div>
            {item('Agrupar (Ctrl+G)', Group, commands.groupSelected, selectedCount < 2)}
            {item('Desagrupar (Ctrl+Mayús+G)', Ungroup, commands.ungroupSelected, selectedElement?.type !== 'group')}
            <div className="arrange-menu__title">Alinear</div>
            {ALIGN_OPTIONS.map(({ mode, label, Icon }) => item(label, Icon, () => commands.alignSelected(mode)))}
            {item(
              'Distribuir horizontalmente',
              AlignHorizontalDistributeCenter,
              () => commands.distributeSelected('horizontal'),
              selectedCount < 3
            )}
            {item(
              'Distribuir verticalmente',
              AlignVerticalDistributeCenter,
              () => commands.distributeSelected('vertical'),
              selectedCount < 3
            )}
            <div className="arrange-menu__title">Girar</div>
            {item('Girar a la izquierda 15°', RotateCcw, () => commands.rotateSelected(-15), !one)}
            {item('Girar a la derecha 15°', RotateCw, () => commands.rotateSelected(15), !one)}
            {item('Quitar giro', RotateCcwSquare, () => commands.rotateSelected(null), !selectedElement?.rotation)}
          </div>
        )
      }}
    </Dropdown>
  )
}

function ClipboardGroup({ selectedCount, commands }: { selectedCount: number; commands: SlideCommands }) {
  const none = selectedCount === 0
  return (
    <RibbonGroup label="Portapapeles">
      <ToolButton label="Pegar" shortcut="Ctrl+V" large onClick={commands.paste}>
        <ClipboardPaste size={22} />
      </ToolButton>
      <div className="ribbon-stack">
        <ToolButton label="Cortar" shortcut="Ctrl+X" showLabel disabled={none} onClick={commands.cutSelected}>
          <Scissors size={14} />
        </ToolButton>
        <ToolButton
          label="Copiar"
          shortcut="Ctrl+C"
          showLabel
          disabled={none}
          onClick={() => void commands.copySelected()}
        >
          <Copy size={14} />
        </ToolButton>
        <ToolButton
          label="Duplicar elementos"
          shortcut="Ctrl+D"
          showLabel
          disabled={none}
          onClick={commands.duplicateSelected}
        >
          <CopyPlus size={14} />
        </ToolButton>
      </div>
    </RibbonGroup>
  )
}

function DrawingGroup({
  selectedElement,
  selectedCount,
  commands
}: {
  selectedElement: SlideElement | null
  selectedCount: number
  commands: SlideCommands
}) {
  const shape = selectedElement?.type === 'shape' ? selectedElement : null
  return (
    <>
      <RibbonGroup label="Dibujo">
        <ImageButton commands={commands} />
        <ShapePicker commands={commands} large />
        <ToolButton label="Cuadro de texto" large onClick={commands.insertTextBox}>
          <TypeOutline size={22} />
        </ToolButton>
      </RibbonGroup>
      <RibbonGroup label="Organizar">
        <ArrangeMenu selectedElement={selectedElement} selectedCount={selectedCount} commands={commands} />
        <div className="ribbon-stack">
          <ColorPicker
            label="Relleno de forma"
            icon={<PaintBucket size={15} />}
            disabled={!shape}
            value={shape?.style.fill ?? null}
            clearLabel="Color del tema"
            onChange={(fill) => commands.setShapeStyle({ fill })}
            onClear={() => commands.setShapeStyle({ fill: null })}
          />
          <ColorPicker
            label="Contorno de forma"
            icon={<Pencil size={15} />}
            disabled={!shape}
            value={shape?.style.stroke ?? null}
            clearLabel="Sin contorno"
            onChange={(stroke) => commands.setShapeStyle({ stroke, strokeWidth: shape?.style.strokeWidth || 3 })}
            onClear={() => commands.setShapeStyle({ stroke: null, strokeWidth: 0 })}
          />
        </div>
      </RibbonGroup>
    </>
  )
}

function ThemeGallery({
  presentation,
  currentSlide,
  commands
}: {
  presentation: Presentation
  currentSlide: Slide
  commands: SlideCommands
}) {
  return (
    <RibbonGroup label="Temas">
      <div className="theme-gallery">
        {availableThemes(presentation).map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-card ${presentation.themeId === theme.id ? 'is-active' : ''}`}
            title={theme.name}
            onClick={() => commands.setTheme(theme.id)}
          >
            <SlideView slide={currentSlide} theme={theme} width={104} themeBackground />
            <span>{theme.name}</span>
          </button>
        ))}
      </div>
    </RibbonGroup>
  )
}

const TRANSITIONS: { value: SlideTransition; label: string }[] = [
  { value: 'none', label: 'Ninguna' },
  { value: 'fade', label: 'Desvanecer' },
  { value: 'push', label: 'Empujar' }
]

/** Transición al entrar en la diapositiva actual; se ve en el modo presentación. */
function TransitionGroup({ currentSlide, commands }: { currentSlide: Slide; commands: SlideCommands }) {
  const current = currentSlide.transition ?? 'none'
  return (
    <RibbonGroup label="Transición">
      <div className="ribbon-stack">
        {TRANSITIONS.map(({ value, label }) => (
          <ToolButton
            key={value}
            label={label}
            showLabel
            active={current === value}
            onClick={() => commands.setTransition(value)}
          >
            <Sparkles size={14} />
          </ToolButton>
        ))}
      </div>
    </RibbonGroup>
  )
}
