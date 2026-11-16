import { describe, expect, it } from 'vitest'
import {
  formatBibliography,
  formatCitation,
  initials,
  normalizeSources,
  pagesText,
  parsePeople,
  peopleText,
  sortSources,
  suggestSourceId,
  type BibliographyEntry,
  type Source
} from './citations'

/** La entrada con la cursiva marcada entre asteriscos, para leerla en el test. */
const marked = (entry: BibliographyEntry) =>
  entry.pieces.map((piece) => (piece.italic ? `*${piece.text}*` : piece.text)).join('')

const book: Source = {
  id: 'Gar20',
  type: 'book',
  authors: [{ family: 'García López', given: 'Ana María' }],
  title: 'Introducción a la programación',
  year: '2020',
  edition: '2',
  publisher: 'Editorial Tintero',
  city: 'Madrid'
}

const article: Source = {
  id: 'Per19',
  type: 'journalArticle',
  authors: [
    { family: 'Pérez', given: 'Luis' },
    { family: 'López', given: 'María' },
    { family: 'Ruiz', given: 'José-Luis' }
  ],
  title: 'Aprendizaje automático en el aula',
  year: '2019',
  container: 'Revista de Educación',
  volume: '12',
  issue: '3',
  pages: '45-67',
  doi: '10.1000/xyz123'
}

const website: Source = {
  id: 'OMS23',
  type: 'website',
  authors: [],
  corporateAuthor: 'Organización Mundial de la Salud',
  title: 'Datos sobre salud digital',
  year: '2023',
  url: 'https://who.int/salud-digital',
  accessed: '2026-03-05'
}

describe('nombres', () => {
  it('iniciales de nombres compuestos y con guion', () => {
    expect(initials('Ana María')).toBe('A. M.')
    expect(initials('José-Luis')).toBe('J.-L.')
  })

  it('el cuadro de fuentes escribe "Apellido, Nombre; Apellido, Nombre"', () => {
    const people = parsePeople('García López, Ana; Pérez')
    expect(people).toEqual([{ family: 'García López', given: 'Ana' }, { family: 'Pérez' }])
    expect(peopleText(people)).toBe('García López, Ana; Pérez')
  })
})

describe('citas en el texto', () => {
  it('APA 7: uno, dos y tres o más autores', () => {
    expect(formatCitation(book, 'apa')).toBe('(García López, 2020)')
    expect(formatCitation({ ...article, authors: article.authors.slice(0, 2) }, 'apa')).toBe('(Pérez y López, 2019)')
    expect(formatCitation(article, 'apa')).toBe('(Pérez et al., 2019)')
  })

  it('con páginas: p. para una y pp. para un intervalo', () => {
    expect(formatCitation(book, 'apa', { pages: '15' })).toBe('(García López, 2020, p. 15)')
    expect(formatCitation(book, 'apa', { pages: '15-17' })).toBe('(García López, 2020, pp. 15–17)')
    expect(pagesText('3 , 8')).toBe('pp. 3 , 8')
  })

  it('organización autora, sin fecha y sin autor', () => {
    expect(formatCitation(website, 'apa')).toBe('(Organización Mundial de la Salud, 2023)')
    expect(formatCitation({ ...book, year: undefined }, 'apa')).toBe('(García López, s. f.)')
    expect(formatCitation({ ...book, authors: [] }, 'apa')).toBe('(«Introducción a la programación», 2020)')
  })

  it('ISO 690: apellidos en mayúsculas y et al. desde cuatro autores', () => {
    expect(formatCitation(article, 'iso690', { pages: '50' })).toBe('(PÉREZ, LÓPEZ y RUIZ, 2019, p. 50)')
    const four = { ...article, authors: [...article.authors, { family: 'Sanz' }] }
    expect(formatCitation(four, 'iso690')).toBe('(PÉREZ et al., 2019)')
  })

  it('mismo autor y año: 2020a y 2020b, por orden de título', () => {
    const second: Source = { ...book, id: 'Gar20a', title: 'Algoritmos' }
    const all = [book, second]
    expect(formatCitation(second, 'apa', {}, all)).toBe('(García López, 2020a)')
    expect(formatCitation(book, 'apa', {}, all)).toBe('(García López, 2020b)')
  })

  it('una fuente borrada se avisa', () => {
    expect(formatCitation(undefined, 'apa')).toBe('(Fuente no encontrada)')
  })
})

describe('bibliografía APA 7', () => {
  it('libro con edición', () => {
    expect(marked(formatBibliography([book], 'apa')[0])).toBe(
      'García López, A. M. (2020). *Introducción a la programación* (2.ª ed.). Editorial Tintero.'
    )
  })

  it('artículo con volumen en cursiva, número, páginas y DOI', () => {
    expect(marked(formatBibliography([article], 'apa')[0])).toBe(
      'Pérez, L., López, M. y Ruiz, J.-L. (2019). Aprendizaje automático en el aula. *Revista de Educación*, *12*(3), 45–67. https://doi.org/10.1000/xyz123'
    )
  })

  it('web de una organización', () => {
    expect(marked(formatBibliography([website], 'apa')[0])).toBe(
      'Organización Mundial de la Salud. (2023). *Datos sobre salud digital*. https://who.int/salud-digital'
    )
  })

  it('capítulo de libro con editores', () => {
    const chapter: Source = {
      id: 'Sanz21',
      type: 'bookSection',
      authors: [{ family: 'Sanz', given: 'Eva' }],
      title: 'Redes neuronales',
      year: '2021',
      container: 'Manual de IA',
      editors: [{ family: 'Martín', given: 'Pablo' }],
      pages: '10-30',
      publisher: 'Prensa Universitaria'
    }
    expect(marked(formatBibliography([chapter], 'apa')[0])).toBe(
      'Sanz, E. (2021). Redes neuronales. En P. Martín (Ed.), *Manual de IA* (pp. 10–30). Prensa Universitaria.'
    )
  })

  it('sin autor, el título va delante', () => {
    const anonymous: Source = { id: 'X', type: 'book', authors: [], title: 'Libro sin autor', year: '2001' }
    expect(marked(formatBibliography([anonymous], 'apa')[0])).toBe('*Libro sin autor.* (2001).')
  })

  it('se ordena por apellido (con acentos bien ordenados)', () => {
    const names = sortSources([website, article, book]).map((source) => source.id)
    expect(names).toEqual(['Gar20', 'OMS23', 'Per19'])
  })
})

describe('bibliografía ISO 690 (autor-fecha)', () => {
  it('libro: APELLIDO, Nombre, año. Título. Edición. Lugar: Editorial.', () => {
    expect(marked(formatBibliography([book], 'iso690')[0])).toBe(
      'GARCÍA LÓPEZ, Ana María, 2020. *Introducción a la programación*. 2.ª ed. Madrid: Editorial Tintero.'
    )
  })

  it('artículo con volumen, número, páginas y DOI', () => {
    expect(marked(formatBibliography([article], 'iso690')[0])).toBe(
      'PÉREZ, Luis, LÓPEZ, María y RUIZ, José-Luis, 2019. Aprendizaje automático en el aula. *Revista de Educación*. Vol. 12, n.º 3, pp. 45–67. DOI 10.1000/xyz123.'
    )
  })

  it('web con fecha de consulta', () => {
    expect(marked(formatBibliography([website], 'iso690')[0])).toBe(
      'ORGANIZACIÓN MUNDIAL DE LA SALUD, 2023. *Datos sobre salud digital* [en línea]. [consulta: 5 marzo 2026]. Disponible en: https://who.int/salud-digital'
    )
  })
})

describe('etiquetas y archivo', () => {
  it('propone etiquetas como Word y no repite', () => {
    expect(suggestSourceId(book, [])).toBe('Gar20')
    expect(suggestSourceId(book, ['Gar20'])).toBe('Gar20a')
    expect(suggestSourceId({ authors: [], title: '', year: '' }, [])).toBe('Fue')
  })

  it('valida las fuentes del archivo y descarta las rotas', () => {
    const sources = normalizeSources([book, { id: '' }, null, { ...book }, { id: 'N', title: 'Sin tipo', year: 1999 }])
    expect(sources.map((source) => source.id)).toEqual(['Gar20', 'N'])
    expect(sources[1]).toMatchObject({ type: 'other', authors: [], year: '1999' })
  })
})
