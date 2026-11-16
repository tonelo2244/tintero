import {
  ArrowLeftRight,
  Captions,
  Footprints,
  Images,
  Library,
  ListTree,
  NotebookText,
  Quote,
  RefreshCw,
  Repeat,
  Signpost,
  SquareAsterisk,
  TableOfContents
} from 'lucide-react'
import { Dropdown, RibbonGroup } from '@/ui/Ribbon'
import { CAPTION_LABELS } from '../../model/captions'
import { CITATION_STYLES } from '../../model/citations'
import { CommandButton, CommandMenuItem } from './CommandButton'
import { useCommandContext } from './commandContext'

const TOC_PRESETS = [
  { levels: 3, label: 'Tabla automática', description: 'Títulos 1, 2 y 3' },
  { levels: 2, label: 'Tabla breve', description: 'Títulos 1 y 2' },
  { levels: 1, label: 'Solo capítulos', description: 'Título 1' },
  { levels: 6, label: 'Tabla completa', description: 'Todos los niveles de título' }
]

const BIBLIOGRAPHY_TITLES = ['Referencias', 'Bibliografía', 'Obras citadas']

/**
 * Pestaña Referencias (fase 17): todo lo que hace falta para un trabajo de clase o una memoria de
 * prácticas. Tabla de contenido, notas, citas y bibliografía, y títulos con referencias cruzadas.
 */
export function ReferencesTab() {
  const { ui } = useCommandContext()
  return (
    <>
      <RibbonGroup label="Tabla de contenido">
        <Dropdown label="Tabla de contenido" large trigger={<TableOfContents size={22} />}>
          {(close) => (
            <>
              {TOC_PRESETS.map((preset) => (
                <CommandMenuItem key={preset.levels} command="tableOfContents" arg={preset.levels} onDone={close}>
                  <span className="layout-option">
                    {preset.label}
                    <small>{preset.description}</small>
                  </span>
                </CommandMenuItem>
              ))}
            </>
          )}
        </Dropdown>
        <CommandButton command="updateTables" large icon={<RefreshCw size={22} />} />
      </RibbonGroup>
      <RibbonGroup label="Notas al pie">
        <CommandButton command="insertFootnote" large icon={<Footprints size={22} />} />
        <CommandButton command="insertEndnote" large icon={<NotebookText size={22} />} />
        <Dropdown label="Siguiente nota" large trigger={<SquareAsterisk size={22} />}>
          {(close) => (
            <>
              <CommandMenuItem command="goToNote" arg={{ kind: 'footnote', direction: 1 }} onDone={close}>
                Siguiente nota al pie
              </CommandMenuItem>
              <CommandMenuItem command="goToNote" arg={{ kind: 'footnote', direction: -1 }} onDone={close}>
                Nota al pie anterior
              </CommandMenuItem>
              <CommandMenuItem command="goToNote" arg={{ kind: 'endnote', direction: 1 }} onDone={close}>
                Siguiente nota al final
              </CommandMenuItem>
              <CommandMenuItem command="goToNote" arg={{ kind: 'endnote', direction: -1 }} onDone={close}>
                Nota al final anterior
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
        <Dropdown label="Convertir" large trigger={<Repeat size={22} />}>
          {(close) => (
            <>
              <CommandMenuItem command="convertNotes" arg="footnote" onDone={close}>
                Todas las notas al pie, en notas al final
              </CommandMenuItem>
              <CommandMenuItem command="convertNotes" arg="endnote" onDone={close}>
                Todas las notas al final, en notas al pie
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
      </RibbonGroup>
      <RibbonGroup label="Citas y bibliografía">
        <Dropdown label="Insertar cita" large trigger={<Quote size={22} />}>
          {(close) => (
            <div className="writer-references-menu">
              {ui.sources.map((source) => (
                <CommandMenuItem key={source.id} command="insertCitation" arg={source.id} onDone={close}>
                  <span className="layout-option">
                    {source.title || source.id}
                    <small>
                      {[source.authors[0]?.family ?? source.corporateAuthor, source.year].filter(Boolean).join(', ')}
                    </small>
                  </span>
                </CommandMenuItem>
              ))}
              <CommandMenuItem command="manageSources" onDone={close}>
                Agregar nueva fuente…
              </CommandMenuItem>
            </div>
          )}
        </Dropdown>
        <CommandButton command="manageSources" large icon={<Library size={22} />} />
        <Dropdown
          label={`Estilo: ${CITATION_STYLES.find((style) => style.style === ui.citationStyle)?.label ?? 'APA'}`}
          large
          trigger={<Signpost size={22} />}
        >
          {(close) => (
            <>
              {CITATION_STYLES.map((style) => (
                <CommandMenuItem key={style.style} command="citationStyle" arg={style.style} onDone={close}>
                  <span className="layout-option">
                    {style.label}
                    <small>{style.description}</small>
                  </span>
                </CommandMenuItem>
              ))}
            </>
          )}
        </Dropdown>
        <Dropdown label="Bibliografía" large trigger={<ListTree size={22} />}>
          {(close) => (
            <>
              {BIBLIOGRAPHY_TITLES.map((title) => (
                <CommandMenuItem key={title} command="bibliography" arg={title} onDone={close}>
                  {title}
                </CommandMenuItem>
              ))}
              <CommandMenuItem command="bibliography" arg="" onDone={close}>
                Sin título
              </CommandMenuItem>
            </>
          )}
        </Dropdown>
      </RibbonGroup>
      <RibbonGroup label="Títulos">
        <CommandButton command="insertCaption" large icon={<Captions size={22} />} />
        <Dropdown label="Tabla de ilustraciones" large trigger={<Images size={22} />}>
          {(close) => (
            <>
              {CAPTION_LABELS.map((label) => (
                <CommandMenuItem key={label} command="tableOfFigures" arg={label} onDone={close}>
                  Índice de {label === 'Figura' ? 'figuras' : label === 'Tabla' ? 'tablas' : 'ecuaciones'}
                </CommandMenuItem>
              ))}
            </>
          )}
        </Dropdown>
        <CommandButton command="crossReference" large icon={<ArrowLeftRight size={22} />} />
      </RibbonGroup>
    </>
  )
}
