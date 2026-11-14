import { AlignmentType, BorderStyle, LevelFormat, type ILevelsOptions, type IStylesOptions } from 'docx'

/**
 * Estilos del .docx que genera Tintero. Los ids y nombres coinciden con los integrados de Word
 * ("Heading 1", "Title", "Quote"...), así el documento se ve bien en cualquier suite y,
 * al importarlo de vuelta, se reconocen por nombre.
 */

/** Unidades de Word: twips (1/20 de punto) y medios puntos para el tamaño de letra. */
export const TWIPS_PER_CM = 567
export const halfPoints = (pt: number) => Math.round(pt * 2)

export const DOCX_STYLE = {
  title: 'Title',
  subtitle: 'Subtitle',
  quote: 'Quote',
  noSpacing: 'NoSpacing',
  blockQuote: 'BlockText',
  code: 'HTMLPreformatted'
} as const

const BODY_FONT = 'Calibri'
const HEADING_COLOR = '2F5496'

export const docxStyles: IStylesOptions = {
  default: {
    document: {
      run: { font: BODY_FONT, size: halfPoints(12), color: '111111' },
      paragraph: { spacing: { after: 160, line: 312 } }
    },
    title: { run: { font: BODY_FONT, size: halfPoints(28), color: '111111' }, paragraph: { spacing: { after: 80 } } },
    heading1: {
      run: { font: BODY_FONT, size: halfPoints(16), color: HEADING_COLOR },
      paragraph: { spacing: { before: 360, after: 120 } }
    },
    heading2: {
      run: { font: BODY_FONT, size: halfPoints(13), color: HEADING_COLOR },
      paragraph: { spacing: { before: 240, after: 80 } }
    },
    heading3: {
      run: { font: BODY_FONT, size: halfPoints(12), color: '1F3763' },
      paragraph: { spacing: { before: 200, after: 80 } }
    }
  },
  paragraphStyles: [
    {
      id: DOCX_STYLE.subtitle,
      name: 'Subtitle',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { size: halfPoints(14), color: '5A5A5A' },
      paragraph: { spacing: { after: 280 } }
    },
    {
      id: DOCX_STYLE.quote,
      name: 'Quote',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { italics: true, color: '404040' },
      paragraph: {
        alignment: AlignmentType.CENTER,
        indent: { left: Math.round(1.5 * TWIPS_PER_CM), right: Math.round(1.5 * TWIPS_PER_CM) },
        spacing: { before: 240, after: 240 }
      }
    },
    {
      id: DOCX_STYLE.noSpacing,
      name: 'No Spacing',
      basedOn: 'Normal',
      quickFormat: true,
      paragraph: { spacing: { before: 0, after: 0 } }
    },
    {
      id: DOCX_STYLE.blockQuote,
      name: 'Block Text',
      basedOn: 'Normal',
      run: { color: '444444' },
      paragraph: {
        indent: { left: 240 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C8C8C8', space: 8 } }
      }
    },
    {
      id: DOCX_STYLE.code,
      name: 'HTML Preformatted',
      basedOn: 'Normal',
      run: { font: 'Courier New', size: halfPoints(10.5) },
      paragraph: { spacing: { after: 0, line: 240 }, shading: { type: 'clear', fill: 'F4F4F4', color: 'auto' } }
    }
  ]
}

const LIST_LEVELS = 9
const BULLET_SYMBOLS = ['•', '◦', '▪']
const NUMBER_FORMATS = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN]

const levelIndent = (level: number) => ({ left: 720 * (level + 1), hanging: 360 })

export const BULLET_LIST_REFERENCE = 'tintero-bullets'
export const numberedListReference = (start: number) => `tintero-numbers-${start}`

export function bulletLevels(): ILevelsOptions[] {
  return Array.from({ length: LIST_LEVELS }, (_, level) => ({
    level,
    format: LevelFormat.BULLET,
    text: BULLET_SYMBOLS[level % BULLET_SYMBOLS.length],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: levelIndent(level) } }
  }))
}

/** Word guarda el número inicial en la definición de la lista, así que hay una por cada `start` distinto. */
export function numberedLevels(start: number): ILevelsOptions[] {
  return Array.from({ length: LIST_LEVELS }, (_, level) => ({
    level,
    format: NUMBER_FORMATS[level % NUMBER_FORMATS.length],
    text: `%${level + 1}.`,
    start: level === 0 ? start : 1,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: levelIndent(level) } }
  }))
}
