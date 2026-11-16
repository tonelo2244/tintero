import { useEditorState, type Editor } from '@tiptap/react'
import type { PageSetup } from '../model/pageSetup'
import { SECTION_BREAK, sectionBreakSetup } from '../model/sections'

export interface CurrentSection {
  /** 0 es la primera sección (la del documento). */
  index: number
  /** Posición del salto que abre la sección; null en la primera. */
  breakPos: number | null
  pageSetup: PageSetup
}

/**
 * Sección donde está el cursor. Disposición > Márgenes, Orientación y Tamaño cambian la hoja de
 * esta sección, como "Aplicar a: esta sección" en Word.
 */
export function useCurrentSection(editor: Editor | null, documentSetup: PageSetup): CurrentSection {
  const first: CurrentSection = { index: 0, breakPos: null, pageSetup: documentSetup }
  return (
    useEditorState({
      editor,
      selector: ({ editor: current }): CurrentSection => {
        if (!current) return first
        const { doc, selection } = current.state
        let section = first
        let index = 0
        doc.forEach((node, offset) => {
          if (offset >= selection.from || node.type.name !== SECTION_BREAK) return
          index++
          section = {
            index,
            breakPos: offset,
            pageSetup: sectionBreakSetup({ type: node.type.name, attrs: node.attrs }, section.pageSetup)
          }
        })
        return section
      },
      equalityFn: (a, b) => a?.breakPos === b?.breakPos && JSON.stringify(a?.pageSetup) === JSON.stringify(b?.pageSetup)
    }) ?? first
  )
}
