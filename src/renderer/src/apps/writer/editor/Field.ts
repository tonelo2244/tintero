import { Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { FIELD, FIELD_KINDS, fieldText, isFieldKind, type FieldContext, type FieldKind } from '../model/fields'
import { pageOfPosition } from '../model/pageLayout'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    field: {
      /** Inserta un campo donde está el cursor. */
      insertField: (kind: FieldKind) => ReturnType
      /** Datos del documento que no están en el texto (nombre del archivo, autor). */
      setFieldContext: (context: Partial<Pick<FieldContext, 'fileName' | 'author'>>) => ReturnType
    }
  }
}

export interface FieldStorage {
  fileName: string
  author: string
}

/**
 * Campo: nodo en línea que solo guarda su tipo (`date`, `page`...) y pinta el valor del momento.
 * El número de página sale de la paginación (las posiciones donde empieza cada hoja), así que el
 * campo dice lo mismo en pantalla que al imprimir. Se repinta después de cada transacción: también
 * después de las que solo mueven hojas, que la paginación despacha aparte.
 */
export const Field = Node.create<object, FieldStorage>({
  name: FIELD,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addStorage() {
    return { fileName: '', author: '' }
  },

  addAttributes() {
    return {
      kind: {
        default: 'date',
        parseHTML: (element) => {
          const kind = element.getAttribute('data-field')
          return isFieldKind(kind) ? kind : 'date'
        }
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-field]' }]
  },

  renderHTML({ node }) {
    const kind = node.attrs.kind as FieldKind
    const label = FIELD_KINDS.find((field) => field.kind === kind)?.label ?? 'Campo'
    return ['span', { 'data-field': kind, class: 'writer-field', title: `Campo: ${label}` }]
  },

  // Al copiar como texto (y para contar palabras), el valor que tendría ahora sin paginar.
  renderText({ node }) {
    return fieldText(node.attrs.kind as FieldKind, {
      date: new Date(),
      page: 1,
      pages: 1,
      fileName: this.storage.fileName,
      author: this.storage.author
    })
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('span')
      dom.className = 'writer-field'
      dom.setAttribute('data-field', node.attrs.kind)
      dom.contentEditable = 'false'
      const label = FIELD_KINDS.find((field) => field.kind === node.attrs.kind)?.label ?? 'Campo'
      dom.title = `Campo: ${label}`
      let kind = node.attrs.kind as FieldKind
      const paint = () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined
        const pagination = editor.storage.pagination as { pageStarts: number[]; pageCount: number } | undefined
        const text = fieldText(kind, {
          date: new Date(),
          page: pagination && pos !== undefined ? pageOfPosition(pagination.pageStarts, pos) : 1,
          pages: pagination?.pageCount ?? 1,
          fileName: this.storage.fileName,
          author: this.storage.author
        })
        if (dom.textContent !== text) dom.textContent = text
      }
      paint()
      painters.add(paint)
      return {
        dom,
        update: (updated) => {
          if (updated.type.name !== FIELD) return false
          kind = updated.attrs.kind as FieldKind
          paint()
          return true
        },
        destroy: () => painters.delete(paint),
        ignoreMutation: () => true
      }
    }
  },

  addCommands() {
    return {
      insertField:
        (kind) =>
        ({ commands }) =>
          commands.insertContent({ type: FIELD, attrs: { kind } }),
      setFieldContext: (context) => () => {
        Object.assign(this.storage, context)
        repaintAll()
        return true
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('fieldRefresh'),
        // Cualquier transacción puede cambiar una página (también las de la paginación).
        view: () => ({ update: repaintAll })
      })
    ]
  }
})

/**
 * Funciones que repintan cada campo a la vista. Es de módulo y no del almacén porque un editor
 * dividido (Vista > Dividir) tiene dos vistas sobre el mismo documento: las dos se repintan.
 */
const painters = new Set<() => void>()
const repaintAll = () => painters.forEach((paint) => paint())
