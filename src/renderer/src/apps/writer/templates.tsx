import { generateJSON } from '@tiptap/core'
import type { AppTemplate } from '@/core/appModule'
import { createWriterExtensions } from './editor/extensions'
import type { WriterContent } from './model/content'

/** Las plantillas se escriben en HTML (más legible) y se convierten al JSON del editor. */
function fromHtml(html: string): WriterContent {
  return { doc: generateJSON(html, createWriterExtensions()) }
}

const TOUR_HTML = `
<p data-style="title">Bienvenido a Tintero Texto</p>
<p data-style="subtitle">Un recorrido rápido de 2 minutos</p>
<h1>1. Da formato al texto</h1>
<p>Selecciona una palabra y usa la cinta <strong>Inicio</strong>: <strong>negrita</strong>, <em>cursiva</em>, <u>subrayado</u>, <s>tachado</s>, H<sub>2</sub>O, E = mc<sup>2</sup>, <mark data-color="#fff176" style="background-color:#fff176">resaltado</mark> y <span style="color:#c0392b">color</span>.</p>
<h1>2. Organiza con estilos</h1>
<p>La galería <strong>Estilos</strong> aplica Título, Subtítulo o Título 1/2/3 al párrafo entero. Usar estilos en vez de formato manual mantiene el documento coherente.</p>
<h1>3. Listas y sangrías</h1>
<ul><li><p>Pulsa <strong>Tab</strong> para aumentar la sangría.</p></li><li><p><strong>Mayús+Tab</strong> para reducirla.</p></li></ul>
<h1>4. Guarda en tu disco</h1>
<p>Todo es local: <strong>Ctrl/Cmd+S</strong> guarda un archivo <code>.tdoc</code> donde tú elijas. Nada sale de tu ordenador.</p>
`

const NOTES_HTML = `
<p data-style="title">Notas de reunión</p>
<p data-style="subtitle">${new Date().toLocaleDateString('es-ES', { dateStyle: 'long' })}</p>
<h2>Asistentes</h2>
<ul><li><p></p></li></ul>
<h2>Temas tratados</h2>
<ul><li><p></p></li></ul>
<h2>Próximos pasos</h2>
<ol><li><p></p></li></ol>
`

function BlankPreview() {
  return <div className="doc-thumb" />
}

function TourPreview() {
  return (
    <div className="doc-thumb doc-thumb--tour">
      <span>
        Realizar
        <br />
        un recorrido
      </span>
      <span className="doc-thumb__arrow">→</span>
    </div>
  )
}

function NotesPreview() {
  return (
    <div className="doc-thumb doc-thumb--notes">
      <b>Notas de reunión</b>
      {Array.from({ length: 7 }, (_, index) => (
        <i key={index} style={{ width: `${60 + ((index * 17) % 35)}%` }} />
      ))}
    </div>
  )
}

export const writerTemplates: AppTemplate<WriterContent>[] = [
  {
    id: 'blank',
    name: 'Documento en blanco',
    Preview: BlankPreview,
    createContent: () => ({ doc: { type: 'doc', content: [{ type: 'paragraph' }] } })
  },
  { id: 'tour', name: 'Bienvenido a Tintero', Preview: TourPreview, createContent: () => fromHtml(TOUR_HTML) },
  { id: 'notes', name: 'Tomar notas', Preview: NotesPreview, createContent: () => fromHtml(NOTES_HTML) }
]
