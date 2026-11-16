import JSZip from 'jszip'
import type { SlideTransition } from '../types'

/**
 * Corrección del XML que genera pptxgenjs.
 *
 * Con varios trozos de texto en un mismo párrafo (formato por palabra), pptxgenjs escribe un
 * <a:pPr> delante de CADA trozo. El estándar solo permite uno, al principio del párrafo, y
 * PowerPoint puede decir que el archivo "necesita reparación". Aquí dejamos solo el primero.
 * Es una función pura sobre texto: fácil de probar y de quitar si la librería lo arregla.
 */
const PARAGRAPH = /<a:p>([\s\S]*?)<\/a:p>/g
const PARAGRAPH_PROPERTIES = /<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/g

export function keepFirstParagraphProperties(xml: string): string {
  return xml.replace(PARAGRAPH, (_paragraph, inner: string) => {
    let seen = false
    const fixed = inner.replace(PARAGRAPH_PROPERTIES, (properties) => {
      if (seen) return ''
      seen = true
      return properties
    })
    return `<a:p>${fixed}</a:p>`
  })
}

/** XML de cada transición. "Empujar" va hacia la izquierda: la nueva entra por la derecha. */
const TRANSITION_XML: Record<Exclude<SlideTransition, 'none'>, string> = {
  fade: '<p:transition spd="med"><p:fade/></p:transition>',
  push: '<p:transition spd="med"><p:push dir="l"/></p:transition>'
}

/**
 * Añade la transición a una diapositiva (pptxgenjs no sabe escribirlas). El estándar la pone justo
 * después de `p:clrMapOvr`, o de `p:cSld` si no hay mapa de colores.
 */
export function addTransition(xml: string, transition: SlideTransition | undefined): string {
  if (!transition || transition === 'none' || xml.includes('<p:transition')) return xml
  const anchor = xml.includes('</p:clrMapOvr>') ? '</p:clrMapOvr>' : '</p:cSld>'
  return xml.replace(anchor, `${anchor}${TRANSITION_XML[transition]}`)
}

/**
 * Aplica las correcciones a cada diapositiva del .pptx. `transitions[i]` es la de la diapositiva
 * i + 1 (pptxgenjs las numera en el orden en que se añaden).
 */
export async function fixSlideParagraphs(
  bytes: Uint8Array,
  transitions: (SlideTransition | undefined)[] = []
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  for (const name of slides) {
    const number = Number(/slide(\d+)\.xml$/.exec(name)![1])
    const xml = await zip.file(name)!.async('string')
    zip.file(name, addTransition(keepFirstParagraphProperties(xml), transitions[number - 1]))
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
