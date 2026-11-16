import { describe, expect, it } from 'vitest'
import { cleanLatex, parseBibtex, parseBibtexNames } from './bibtex'

const SAMPLE = `
% Exportado de Google Académico
@article{perez2019aprendizaje,
  title={Aprendizaje autom{\\'a}tico en el aula},
  author={P{\\'e}rez, Luis and L{\\'o}pez, Mar{\\'\\i}a and others},
  journal={Revista de Educaci{\\'o}n},
  volume={12},
  number={3},
  pages={45--67},
  year={2019},
  doi = "10.1000/xyz123"
}

@book{garcia2020,
  author = {Ana Mar\\'ia Garc\\'ia L\\'opez},
  title = {{Introducci\\'on} a la programaci\\'on},
  publisher = {Editorial Tintero},
  address = {Madrid},
  year = 2020,
  edition = {2}
}

@misc{oms, title = "Datos " # "de salud", url = {https://who.int}, year = {2023}, urldate = {2026-03-05}}
@phdthesis{tesis, author = {Ruiz, Eva}, title = {Una tesis}, school = {Universidad de Sevilla}, year = {2024}}
@comment{esto no es una fuente}
@book{rota, author = {Nadie}}
`

describe('BibTeX', () => {
  it('lee artículos, libros, webs y tesis', () => {
    const { sources, skipped } = parseBibtex(SAMPLE)
    expect(sources.map((source) => [source.id, source.type])).toEqual([
      ['perez2019aprendizaje', 'journalArticle'],
      ['garcia2020', 'book'],
      ['oms', 'website'],
      ['tesis', 'report']
    ])
    expect(skipped).toEqual(['rota'])
    expect(sources[0]).toMatchObject({
      title: 'Aprendizaje automático en el aula',
      container: 'Revista de Educación',
      authors: [
        { family: 'Pérez', given: 'Luis' },
        { family: 'López', given: 'María' }
      ],
      volume: '12',
      issue: '3',
      pages: '45–67',
      doi: '10.1000/xyz123'
    })
    expect(sources[1]).toMatchObject({
      city: 'Madrid',
      year: '2020',
      edition: '2',
      title: 'Introducción a la programación'
    })
    expect(sources[2]).toMatchObject({ title: 'Datos de salud', url: 'https://who.int', accessed: '2026-03-05' })
    expect(sources[3]).toMatchObject({ publisher: 'Universidad de Sevilla', reportType: 'Tesis doctoral' })
  })

  it('una clave que ya existe se cambia por una nueva', () => {
    const { sources } = parseBibtex('@book{garcia2020, author={García, Ana}, title={X}, year={2020}}', ['garcia2020'])
    expect(sources[0].id).toBe('Gar20')
  })

  it('nombres en los dos órdenes y con partículas', () => {
    expect(parseBibtexNames('Ana de la Fuente and Smith, John')).toEqual([
      { family: 'de la Fuente', given: 'Ana' },
      { family: 'Smith', given: 'John' }
    ])
  })

  it('limpia el LaTeX de los valores', () => {
    expect(cleanLatex('Espa{\\~n}a \\& Portugal --- {\\textit{Hola}}')).toBe('España & Portugal –- Hola')
  })
})
