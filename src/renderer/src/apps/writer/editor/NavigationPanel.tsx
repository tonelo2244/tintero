import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import { DOMSerializer } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { ChevronDown, ChevronRight, Compass, X } from 'lucide-react'
import { headingIndexAt, headingsOf, planSectionMove, sectionEnd, type OutlineHeading } from '../model/outline'
import { documentOutline, moveSection, topLevelIndexAt } from '../model/outlineEdits'
import type { PageGeometry } from '../model/pageSetup'
import { pageOfPosition } from '../model/pageLayout'

type NavigationTab = 'headings' | 'pages'

interface NavigationPanelProps {
  editor: Editor
  /** Las miniaturas solo existen con hojas (Diseño de impresión). */
  paginated: boolean
  geometry: PageGeometry
  sheetStyle: CSSProperties
  onGoToPage(page: number): void
  onClose(): void
}

/**
 * Panel de navegación (Vista > Panel de navegación, como el de Word): el árbol de títulos para
 * saltar y arrastrar secciones enteras, y las miniaturas de las hojas. El árbol sale de
 * `headingsOf` (model/outline.ts), una función pura sobre los bloques del documento.
 */
export function NavigationPanel({
  editor,
  paginated,
  geometry,
  sheetStyle,
  onGoToPage,
  onClose
}: NavigationPanelProps) {
  const [tab, setTab] = useState<NavigationTab>('headings')

  return (
    <aside className="writer-comments writer-navigation" aria-label="Navegación">
      <header className="writer-comments__header">
        <Compass size={16} />
        <span>Navegación</span>
        <button type="button" className="writer-comments__icon" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="writer-navigation__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'headings'} onClick={() => setTab('headings')}>
          Títulos
        </button>
        <button type="button" role="tab" aria-selected={tab === 'pages'} onClick={() => setTab('pages')}>
          Páginas
        </button>
      </div>
      {tab === 'headings' ? (
        <HeadingTree editor={editor} />
      ) : paginated ? (
        <PageThumbnails editor={editor} geometry={geometry} sheetStyle={sheetStyle} onGoToPage={onGoToPage} />
      ) : (
        <p className="writer-comments__empty">Las miniaturas de las páginas se ven en Diseño de impresión.</p>
      )}
    </aside>
  )
}

/** Dónde caería lo que se arrastra: delante del bloque `insertAt` (índices del documento). */
interface DropTarget {
  insertAt: number
  /** Título junto al que se pinta la raya, y si va encima o debajo. */
  headingIndex: number
  after: boolean
}

function HeadingTree({ editor }: { editor: Editor }) {
  // Solo lo que pinta el árbol: se repinta cuando cambian los títulos o el título del cursor.
  const outline = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { blocks } = documentOutline(current.state.doc)
      return {
        headings: headingsOf(blocks),
        active: headingIndexAt(blocks, topLevelIndexAt(current.state.doc, current.state.selection.from)),
        blockCount: blocks.length,
        sectionEnds: blocks.map((_, index) => sectionEnd(blocks, index))
      }
    }
  })
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set())
  const [dragging, setDragging] = useState<number | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)

  const visible = useMemo(() => visibleHeadings(outline.headings, collapsed), [outline.headings, collapsed])
  if (outline.headings.length === 0) {
    return (
      <p className="writer-comments__empty">
        No hay títulos. Usa los estilos Título 1, Título 2… en Inicio para que aparezcan aquí.
      </p>
    )
  }

  const goTo = (heading: OutlineHeading) => {
    const pos = documentOutline(editor.state.doc).positions[heading.blockIndex]
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 1)
      .run()
    const element = editor.view.nodeDOM(pos)
    if (element instanceof HTMLElement) element.scrollIntoView({ block: 'start' })
  }

  const onDragOver = (event: DragEvent, heading: OutlineHeading) => {
    if (dragging === null) return
    const box = event.currentTarget.getBoundingClientRect()
    const after = event.clientY > box.top + box.height / 2
    const insertAt = after ? outline.sectionEnds[heading.blockIndex] : heading.blockIndex
    const { blocks } = documentOutline(editor.state.doc)
    if (!planSectionMove(blocks, dragging, insertAt)) {
      setDrop(null)
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDrop({ insertAt, headingIndex: heading.blockIndex, after })
  }

  const finishDrag = () => {
    setDragging(null)
    setDrop(null)
  }

  return (
    <ul
      className="writer-navigation__tree"
      onDragLeave={(event) => event.target === event.currentTarget && setDrop(null)}
    >
      {visible.map(({ heading, hasChildren }) => {
        const isCollapsed = collapsed.has(heading.blockIndex)
        const dropClass = drop?.headingIndex === heading.blockIndex ? (drop.after ? 'drop-after' : 'drop-before') : ''
        return (
          <li
            key={heading.blockIndex}
            className={`writer-navigation__item ${dropClass} ${outline.active === heading.blockIndex ? 'is-active' : ''}`}
            style={{ paddingLeft: 4 + (heading.level - 1) * 14 }}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', heading.text)
              setDragging(heading.blockIndex)
            }}
            onDragOver={(event) => onDragOver(event, heading)}
            onDrop={(event) => {
              event.preventDefault()
              if (dragging !== null && drop) moveSection(editor, dragging, drop.insertAt)
              finishDrag()
            }}
            onDragEnd={finishDrag}
          >
            <button
              type="button"
              className="writer-navigation__twisty"
              aria-label={isCollapsed ? `Desplegar ${heading.text}` : `Plegar ${heading.text}`}
              style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current)
                  if (next.has(heading.blockIndex)) next.delete(heading.blockIndex)
                  else next.add(heading.blockIndex)
                  return next
                })
              }
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
            <button
              type="button"
              className="writer-navigation__heading"
              aria-current={outline.active === heading.blockIndex ? 'location' : undefined}
              onClick={() => goTo(heading)}
            >
              {heading.text || <i>(título vacío)</i>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Títulos que se ven en el árbol: los de dentro de uno plegado se esconden. */
function visibleHeadings(headings: OutlineHeading[], collapsed: ReadonlySet<number>) {
  const result: { heading: OutlineHeading; hasChildren: boolean }[] = []
  let hiddenBelow: number | null = null
  headings.forEach((heading, index) => {
    if (hiddenBelow !== null && heading.level > hiddenBelow) return
    hiddenBelow = null
    const next = headings[index + 1]
    result.push({ heading, hasChildren: !!next && next.level > heading.level })
    if (collapsed.has(heading.blockIndex)) hiddenBelow = heading.level
  })
  return result
}

/** Ancho de cada miniatura en el panel. */
const THUMBNAIL_WIDTH = 132

/**
 * Miniaturas de las hojas. Cada bloque se dibuja una sola vez, en la hoja donde empieza (la
 * paginación apunta dónde empieza cada una): cuesta lo mismo que el documento, no hojas x documento.
 * El HTML sale del esquema del documento (DOMSerializer), sin decoraciones ni nada editable.
 */
function PageThumbnails({
  editor,
  geometry,
  sheetStyle,
  onGoToPage
}: {
  editor: Editor
  geometry: PageGeometry
  sheetStyle: CSSProperties
  onGoToPage(page: number): void
}) {
  const [pages, setPages] = useState<string[]>([])
  const current = useEditorState({
    editor,
    selector: ({ editor: state }) => {
      const starts = state.storage.pagination?.pageStarts ?? [0]
      return pageOfPosition(starts, state.state.selection.from)
    }
  })

  useEffect(() => {
    let timer = 0
    const build = () => setPages(pageHtml(editor))
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(build, 400)
    }
    build()
    // La paginación despacha una transacción al repartir: cubre tanto escribir como cambiar de hoja.
    editor.on('transaction', schedule)
    return () => {
      window.clearTimeout(timer)
      editor.off('transaction', schedule)
    }
  }, [editor])

  const scale = THUMBNAIL_WIDTH / geometry.width
  return (
    <ol className="writer-navigation__pages">
      {pages.map((html, index) => (
        <li key={index}>
          <button
            type="button"
            className={`writer-thumbnail ${current === index + 1 ? 'is-active' : ''}`}
            aria-label={`Ir a la página ${index + 1}`}
            style={{ width: THUMBNAIL_WIDTH, height: geometry.height * scale }}
            onClick={() => onGoToPage(index + 1)}
          >
            <div
              className="writer-thumbnail__sheet"
              style={{ ...sheetStyle, width: geometry.width, height: geometry.height, transform: `scale(${scale})` }}
            >
              <div className="writer-content" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </button>
          <span>{index + 1}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * HTML de cada hoja: el trozo del documento entre el principio de una hoja y el de la siguiente.
 * Un párrafo o una tabla partidos salen en las dos miniaturas, cada uno con su parte.
 */
function pageHtml(editor: Editor): string[] {
  const { doc } = editor.state
  const starts: number[] = editor.storage.pagination?.pageStarts ?? [0]
  const serializer = DOMSerializer.fromSchema(editor.schema)
  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : doc.content.size
    const page = document.createElement('div')
    page.appendChild(serializer.serializeFragment(doc.slice(start, Math.max(start, end)).content))
    return page.innerHTML
  })
}

/** "Ir a la página": deja el cursor al principio de la hoja. */
export function selectPageStart(editor: Editor, page: number): void {
  const starts: number[] = editor.storage.pagination?.pageStarts ?? [0]
  const { doc } = editor.state
  // El principio de una hoja puede ser el de un bloque o estar dentro de un párrafo partido: se
  // busca el primer sitio donde se puede escribir a partir de ahí.
  const pos = TextSelection.near(doc.resolve(Math.min(starts[page - 1] ?? 0, doc.content.size)), 1).from
  editor.chain().focus().setTextSelection(pos).run()
}
