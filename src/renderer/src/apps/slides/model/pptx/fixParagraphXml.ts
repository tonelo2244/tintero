import JSZip from 'jszip'

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

/** Aplica la corrección a cada diapositiva del .pptx. */
export async function fixSlideParagraphs(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(bytes)
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  for (const name of slides) {
    const xml = await zip.file(name)!.async('string')
    zip.file(name, keepFirstParagraphProperties(xml))
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
