import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import {
  CAPTION_STYLE_ID,
  isReferenceAnchor,
  newReferenceAnchor,
  SEQUENCE,
  type ReferenceTarget
} from '../model/captions'
import { DEFAULT_CITATION_STYLE, type CitationStyle, type Source } from '../model/citations'
import { BOOKMARK, isHiddenBookmark } from '../model/links'
import { isNoteKind, NOTE, noteNumbers, type NoteKind } from '../model/notes'
import { pageOfPosition } from '../model/pageLayout'

declare module '@tiptap/core' {
  interface Storage {
    references: ReferencesStorage
  }
  interface Commands<ReturnType> {
    references: {
      /** Fuentes y estilo de citas del documento (no están en el texto: los guarda el editor aparte). */
      setCitationContext: (context: { sources: Source[]; style: CitationStyle }) => ReturnType
    }
  }
}

export interface ReferencesStorage {
  sources: Source[]
  citationStyle: CitationStyle
  /** Los pone la pantalla: abren el cuadro de una nota o de una cita (doble clic). */
  openNote: ((id: string) => void) | null
  openCitation: ((pos: number) => void) | null
}

/** Una nota con su sitio en el documento. */
export interface PlacedNote {
  id: string
  kind: NoteKind
  text: string
  pos: number
}

/**
 * Índice de todo lo que se numera o se cita en el documento (fase 17): notas, secuencias de los
 * títulos, encabezados, títulos y marcadores. Lo leen los nodos que pintan números (nota, título,
 * referencia cruzada, tabla de contenido) y la paginación. Se calcula una vez por documento: el
 * documento de ProseMirror es inmutable, así que un WeakMap por documento es una caché perfecta.
 */
export interface DocumentIndex {
  notes: PlacedNote[]
  noteNumbers: Map<string, number>
  /** Número de cada secuencia por su posición. */
  sequences: Map<number, number>
  targets: ReferenceTarget[]
  byAnchor: Map<string, ReferenceTarget>
  /** Nombres de todos los marcadores (también los ocultos), para no repetir. */
  bookmarkNames: Set<string>
}

const cache = new WeakMap<ProseMirrorNode, DocumentIndex>()

export function documentIndex(doc: ProseMirrorNode): DocumentIndex {
  const cached = cache.get(doc)
  if (cached) return cached
  const notes: PlacedNote[] = []
  const sequences = new Map<number, number>()
  const counters = new Map<string, number>()
  const bookmarkNames = new Set<string>()
  const bookmarks: ReferenceTarget[] = []
  // 1. Lo que se numera, en orden: notas y secuencias.
  doc.descendants((node, pos) => {
    if (node.type.name === NOTE) {
      notes.push({
        id: String(node.attrs.id),
        kind: isNoteKind(node.attrs.kind) ? node.attrs.kind : 'footnote',
        text: String(node.attrs.text ?? ''),
        pos
      })
    } else if (node.type.name === SEQUENCE) {
      const label = String(node.attrs.label)
      const next = (counters.get(label) ?? 0) + 1
      counters.set(label, next)
      sequences.set(pos, next)
    } else if (node.type.name === BOOKMARK) {
      const name = String(node.attrs.name)
      bookmarkNames.add(name)
      if (name && !isHiddenBookmark(name)) bookmarks.push({ kind: 'bookmark', anchor: name, pos, text: name })
    }
    return true
  })
  // 2. Destinos de referencias: encabezados y títulos, con el texto ya numerado.
  const targets: ReferenceTarget[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const isHeading = node.type.name === 'heading'
    const isCaption = node.attrs.blockStyle === CAPTION_STYLE_ID
    if (!isHeading && !isCaption) return false
    const anchor = referenceAnchorIn(node)
    const text = blockText(node, pos, sequences).replace(/\s+/g, ' ').trim()
    if (isHeading) {
      targets.push({ kind: 'heading', anchor, pos, text, level: Number(node.attrs.level) || 1 })
      return false
    }
    let label: string | undefined
    let number: number | undefined
    let after = ''
    node.forEach((child, offset) => {
      if (label === undefined && child.type.name === SEQUENCE) {
        label = String(child.attrs.label)
        number = sequences.get(pos + 1 + offset)
        after = blockText(node, pos, sequences, offset + child.nodeSize)
      }
    })
    if (label !== undefined) {
      const captionText = after
        .replace(/^[\s:.\-–—]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
      targets.push({ kind: 'caption', anchor, pos, text, label, number, captionText })
    }
    return false
  })
  targets.push(...bookmarks)
  targets.sort((a, b) => a.pos - b.pos)
  const index: DocumentIndex = {
    notes,
    noteNumbers: noteNumbers(notes),
    sequences,
    targets,
    byAnchor: new Map(targets.filter((target) => target.anchor).map((target) => [target.anchor, target])),
    bookmarkNames
  }
  cache.set(doc, index)
  return index
}

/** Marcador oculto `_Ref…` de un bloque, o '' si aún no tiene. */
function referenceAnchorIn(block: ProseMirrorNode): string {
  let anchor = ''
  block.forEach((child) => {
    if (!anchor && child.type.name === BOOKMARK && isReferenceAnchor(String(child.attrs.name)))
      anchor = child.attrs.name
  })
  return anchor
}

/** Texto de un bloque con las secuencias ya numeradas ("Figura 3: ..."), desde `from`. */
function blockText(block: ProseMirrorNode, blockPos: number, sequences: Map<number, number>, from = 0): string {
  let text = ''
  block.forEach((child, offset) => {
    if (offset < from) return
    if (child.isText) text += child.text ?? ''
    else if (child.type.name === SEQUENCE) text += String(sequences.get(blockPos + 1 + offset) ?? '')
    else if (child.type.name === 'hardBreak' || child.type.name === 'tab') text += ' '
  })
  return text
}

/**
 * Da su marcador oculto a los encabezados y títulos que aún no lo tienen (los necesitan la tabla
 * de contenido y las referencias cruzadas), dentro de la transacción. Como Word, que pone un
 * `_Toc…` en cada título al crear la tabla. Devuelve el marcador de cada bloque por su posición
 * original.
 */
export function ensureReferenceAnchors(
  tr: Transaction,
  doc: ProseMirrorNode,
  filter: (target: ReferenceTarget) => boolean = () => true
): Map<number, string> {
  const index = documentIndex(doc)
  const used = new Set(index.bookmarkNames)
  const anchors = new Map<number, string>()
  const missing: ReferenceTarget[] = []
  for (const target of index.targets) {
    if (target.kind === 'bookmark' || !filter(target)) continue
    if (target.anchor) anchors.set(target.pos, target.anchor)
    else missing.push(target)
  }
  const bookmark = doc.type.schema.nodes[BOOKMARK]
  // De atrás hacia delante: cada inserción no mueve las posiciones de las que quedan.
  for (const target of [...missing].reverse()) {
    const name = newReferenceAnchor(used)
    used.add(name)
    tr.insert(target.pos + 1, bookmark.create({ name }))
    anchors.set(target.pos, name)
  }
  return anchors
}

/** Hoja (desde 1) de una posición, según la última paginación. */
export function pageAt(storage: unknown, pos: number): number {
  const pagination = (storage as { pagination?: { pageStarts: number[] } }).pagination
  return pagination ? pageOfPosition(pagination.pageStarts, pos) : 1
}

/**
 * Funciones que repintan los números de notas, títulos, referencias, citas y tablas a la vista.
 * Como los campos (Field.ts): un número depende de todo el documento, no solo de su nodo, así que
 * cada vista registra su función y se repintan todas después de cada transacción (también de las
 * de la paginación, que mueven páginas sin cambiar el texto).
 */
const painters = new Set<() => void>()
export const registerPainter = (paint: () => void) => {
  painters.add(paint)
  return () => painters.delete(paint)
}
export const repaintReferences = () => painters.forEach((paint) => paint())

/** Almacén común y el repintado tras cada transacción. */
export const References = Extension.create<object, ReferencesStorage>({
  name: 'references',

  addStorage() {
    return { sources: [], citationStyle: DEFAULT_CITATION_STYLE, openNote: null, openCitation: null }
  },

  addCommands() {
    return {
      setCitationContext:
        ({ sources, style }) =>
        () => {
          this.storage.sources = sources
          this.storage.citationStyle = style
          repaintReferences()
          // El alto de las citas y de la bibliografía cambia: la paginación tiene que volver a medir.
          this.editor.storage.pagination?.requestLayout?.()
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [new Plugin({ key: new PluginKey('referencesRefresh'), view: () => ({ update: repaintReferences }) })]
  }
})
