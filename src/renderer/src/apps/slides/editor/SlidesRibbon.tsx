import type { ChangeEvent } from 'react'
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  BringToFront,
  Bold,
  Copy,
  ImagePlus,
  Italic,
  List,
  PaintBucket,
  Pencil,
  Play,
  PlaySquare,
  SendToBack,
  Shapes,
  SquarePlus,
  Strikethrough,
  Trash2,
  Type,
  TypeOutline,
  Underline
} from 'lucide-react'
import { ColorPicker } from '@/ui/ColorPicker'
import { FONT_FAMILIES, FONT_SIZES, nextFontSize } from '@/ui/fonts'
import { Dropdown, MenuItem, RibbonGroup, RibbonRow, SelectField, ToolButton } from '@/ui/Ribbon'
import { SLIDE_LAYOUTS } from '../model/factories'
import { getTheme, SLIDE_THEMES } from '../model/themes'
import type { HorizontalAlign, Presentation, ShapeKind, Slide, SlideElement, VerticalAlign } from '../model/types'
import { SHAPE_LABELS, ShapeIcon } from './ElementContent'
import { SlideView } from './SlideView'
import type { SlideCommands } from './useSlideCommands'

export type SlidesTabId = 'home' | 'insert' | 'design' | 'show'

export const SLIDES_TABS: { id: SlidesTabId; label: string }[] = [
  { id: 'home', label: 'Inicio' },
  { id: 'insert', label: 'Insertar' },
  { id: 'design', label: 'Diseño' },
  { id: 'show', label: 'Presentación' }
]

interface SlidesRibbonProps {
  tab: SlidesTabId
  presentation: Presentation
  currentSlide: Slide
  selectedElement: SlideElement | null
  commands: SlideCommands
  onStartSlideshow(fromStart: boolean): void
}

export function SlidesRibbon({ tab, ...props }: SlidesRibbonProps) {
  switch (tab) {
    case 'home':
      return (
        <>
          <SlidesGroup commands={props.commands} />
          <TextGroups
            selectedElement={props.selectedElement}
            commands={props.commands}
            themeId={props.presentation.themeId}
          />
          <DrawingGroup selectedElement={props.selectedElement} commands={props.commands} />
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
        <ThemeGallery presentation={props.presentation} currentSlide={props.currentSlide} commands={props.commands} />
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
  commands,
  themeId
}: {
  selectedElement: SlideElement | null
  commands: SlideCommands
  themeId: string
}) {
  const text = selectedElement?.type === 'text' ? selectedElement : null
  const disabled = !text
  const style = text?.style
  const theme = getTheme(themeId)
  const defaultFont = text?.role === 'title' ? theme.titleFontFamily : theme.fontFamily
  const fontSize = style?.fontSize ?? 24

  return (
    <>
      <RibbonGroup label="Fuente">
        <RibbonRow>
          <SelectField
            label="Fuente"
            disabled={disabled}
            value={style?.fontFamily ?? defaultFont}
            options={FONT_FAMILIES}
            onChange={(fontFamily) => commands.setTextStyle({ fontFamily })}
          />
          <SelectField
            label="Tamaño de fuente"
            width={58}
            disabled={disabled}
            value={String(fontSize)}
            options={FONT_SIZES.map((size) => ({ label: String(size), value: String(size) }))}
            onChange={(value) => commands.setTextStyle({ fontSize: Number(value) })}
          />
          <ToolButton
            label="Aumentar tamaño"
            disabled={disabled}
            onClick={() => commands.setTextStyle({ fontSize: nextFontSize(fontSize, 1) })}
          >
            <AArrowUp size={16} />
          </ToolButton>
          <ToolButton
            label="Disminuir tamaño"
            disabled={disabled}
            onClick={() => commands.setTextStyle({ fontSize: nextFontSize(fontSize, -1) })}
          >
            <AArrowDown size={16} />
          </ToolButton>
        </RibbonRow>
        <RibbonRow>
          <ToolButton
            label="Negrita"
            disabled={disabled}
            active={style?.bold}
            onClick={() => commands.setTextStyle({ bold: !style?.bold })}
          >
            <Bold size={16} />
          </ToolButton>
          <ToolButton
            label="Cursiva"
            disabled={disabled}
            active={style?.italic}
            onClick={() => commands.setTextStyle({ italic: !style?.italic })}
          >
            <Italic size={16} />
          </ToolButton>
          <ToolButton
            label="Subrayado"
            disabled={disabled}
            active={style?.underline}
            onClick={() => commands.setTextStyle({ underline: !style?.underline })}
          >
            <Underline size={16} />
          </ToolButton>
          <ToolButton
            label="Tachado"
            disabled={disabled}
            active={style?.strike}
            onClick={() => commands.setTextStyle({ strike: !style?.strike })}
          >
            <Strikethrough size={16} />
          </ToolButton>
          <ColorPicker
            label="Color de fuente"
            icon={<Type size={16} />}
            disabled={disabled}
            value={style?.color ?? null}
            clearLabel="Color del tema"
            onChange={(color) => commands.setTextStyle({ color })}
            onClear={() => commands.setTextStyle({ color: null })}
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
              active={style?.align === value}
              onClick={() => commands.setTextStyle({ align: value })}
            >
              <Icon size={16} />
            </ToolButton>
          ))}
        </RibbonRow>
        <RibbonRow>
          <ToolButton
            label="Viñetas"
            disabled={disabled}
            active={style?.bullets}
            onClick={() => commands.setTextStyle({ bullets: !style?.bullets })}
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
    </RibbonGroup>
  )
}

function DrawingGroup({
  selectedElement,
  commands
}: {
  selectedElement: SlideElement | null
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
        <div className="ribbon-stack">
          <ToolButton
            label="Traer al frente"
            showLabel
            disabled={!selectedElement}
            onClick={() => commands.reorderSelected('front')}
          >
            <BringToFront size={14} />
          </ToolButton>
          <ToolButton
            label="Enviar al fondo"
            showLabel
            disabled={!selectedElement}
            onClick={() => commands.reorderSelected('back')}
          >
            <SendToBack size={14} />
          </ToolButton>
        </div>
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
        {SLIDE_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-card ${presentation.themeId === theme.id ? 'is-active' : ''}`}
            title={theme.name}
            onClick={() => commands.setTheme(theme.id)}
          >
            <SlideView slide={currentSlide} themeId={theme.id} width={104} />
            <span>{theme.name}</span>
          </button>
        ))}
      </div>
    </RibbonGroup>
  )
}
