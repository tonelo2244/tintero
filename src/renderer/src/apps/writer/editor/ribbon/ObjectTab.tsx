import {
  ArrowDownToLine,
  ArrowUpToLine,
  Crop,
  Image as ImageIcon,
  PaintBucket,
  PenLine,
  RotateCcw,
  RotateCw,
  Shapes,
  Trash2,
  Undo2,
  WrapText,
  AlignHorizontalJustifyCenter
} from 'lucide-react'
import { ColorPicker } from '@/ui/ColorPicker'
import { Dropdown, RibbonGroup, RibbonRow } from '@/ui/Ribbon'
import { SHAPE_LABELS, ShapeIcon } from '@/apps/slides/editor/ElementContent'
import { runCommand } from '../../model/commands'
import { OBJECT_ALIGNS, WRAP_MODES } from '../../model/floating'
import { objectSize, type SelectedObject } from '../../model/objectEdits'
import { PX_PER_CM } from '../../model/ruler'
import { NumberField } from '../NumberField'
import { SHAPE_KINDS } from '../objects/Shape'
import { CommandButton, CommandMenuItem } from './CommandButton'
import { useCommandContext } from './commandContext'

const toCm = (px: number) => Math.round((px / PX_PER_CM) * 100) / 100

/**
 * Pestaña contextual de objetos (fase 16): "Imagen", "Forma" o "Cuadro de texto" según lo que
 * esté seleccionado. Organizar (ajuste de texto, alinear, orden) y tamaño son comunes a todos.
 */
export function ObjectTab({ object }: { object: SelectedObject }) {
  const context = useCommandContext()
  const size = objectSize(context.editor, object)
  const { type } = object

  return (
    <>
      {type === 'image' && (
        <RibbonGroup label="Ajustar">
          <CommandButton command="cropDialog" large icon={<Crop size={22} />} />
          <RibbonRow>
            <CommandButton
              command="rotateObject"
              arg={-90}
              label="Girar a la izquierda"
              icon={<RotateCcw size={16} />}
            />
            <CommandButton command="rotateObject" arg={90} label="Girar a la derecha" icon={<RotateCw size={16} />} />
          </RibbonRow>
          <RibbonRow>
            <CommandButton command="resetObjectSize" showLabel icon={<Undo2 size={16} />} />
          </RibbonRow>
          <CommandButton command="altTextDialog" large icon={<ImageIcon size={22} />} />
        </RibbonGroup>
      )}

      {(type === 'shape' || type === 'textBox') && (
        <RibbonGroup label={type === 'shape' ? 'Estilos de forma' : 'Estilo del cuadro'}>
          {type === 'shape' && (
            <Dropdown label="Cambiar forma" large trigger={<Shapes size={22} />}>
              {(close) => (
                <>
                  {SHAPE_KINDS.map((kind) => (
                    <CommandMenuItem key={kind} command="changeShape" arg={kind} onDone={close}>
                      <ShapeIcon shape={kind} /> {SHAPE_LABELS[kind]}
                    </CommandMenuItem>
                  ))}
                </>
              )}
            </Dropdown>
          )}
          <RibbonRow>
            <ColorPicker
              label="Relleno"
              icon={<PaintBucket size={16} />}
              value={object.node.attrs.fill ?? null}
              clearLabel="Sin relleno"
              onChange={(color) => runCommand(context, 'objectFill', color)}
              onClear={() => runCommand(context, 'objectFill', null)}
            />
            <ColorPicker
              label="Contorno"
              icon={<PenLine size={16} />}
              value={(type === 'shape' ? object.node.attrs.stroke : object.node.attrs.border) ?? null}
              clearLabel="Sin contorno"
              onChange={(color) => runCommand(context, 'objectOutline', color)}
              onClear={() => runCommand(context, 'objectOutline', null)}
            />
          </RibbonRow>
          {type === 'shape' && (
            <RibbonRow>
              <CommandButton command="rotateObject" arg={90} label="Girar 90°" icon={<RotateCw size={16} />} />
            </RibbonRow>
          )}
        </RibbonGroup>
      )}

      <RibbonGroup label="Organizar">
        <Dropdown label="Ajustar texto" large trigger={<WrapText size={22} />}>
          {(close) => (
            <>
              {WRAP_MODES.map(({ mode, label }) => (
                <CommandMenuItem key={mode} command="objectWrap" arg={mode} onDone={close}>
                  {label}
                </CommandMenuItem>
              ))}
            </>
          )}
        </Dropdown>
        <Dropdown label="Alinear" large trigger={<AlignHorizontalJustifyCenter size={22} />}>
          {(close) => (
            <>
              {OBJECT_ALIGNS.map(({ align, label }) => (
                <CommandMenuItem key={align} command="objectAlign" arg={align} onDone={close}>
                  {label}
                </CommandMenuItem>
              ))}
            </>
          )}
        </Dropdown>
        <Dropdown label="Traer adelante" large trigger={<ArrowUpToLine size={22} />}>
          {(close) => (
            <>
              <CommandMenuItem command="arrange" arg="forward" onDone={close}>
                Traer adelante
              </CommandMenuItem>
              <CommandMenuItem command="arrange" arg="front" onDone={close}>
                Traer al frente
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
        <Dropdown label="Enviar atrás" large trigger={<ArrowDownToLine size={22} />}>
          {(close) => (
            <>
              <CommandMenuItem command="arrange" arg="backward" onDone={close}>
                Enviar atrás
              </CommandMenuItem>
              <CommandMenuItem command="arrange" arg="back" onDone={close}>
                Enviar al fondo
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
      </RibbonGroup>

      <RibbonGroup label="Tamaño">
        <div className="ribbon-number-fields">
          {type !== 'textBox' && (
            <NumberField
              live={false}
              label="Alto"
              unit="cm"
              value={toCm(size.height)}
              onChange={(cm) => runCommand(context, 'objectSize', { height: cm * PX_PER_CM })}
            />
          )}
          <NumberField
            live={false}
            label="Ancho"
            unit="cm"
            value={toCm(size.width)}
            onChange={(cm) => runCommand(context, 'objectSize', { width: cm * PX_PER_CM })}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Eliminar">
        <CommandButton command="deleteObject" large icon={<Trash2 size={22} />} />
      </RibbonGroup>
    </>
  )
}
