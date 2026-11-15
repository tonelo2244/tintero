/**
 * Ayudas mínimas para leer el XML de Office (OOXML) con el DOMParser estándar.
 *
 * Buscamos por nombre local ("sp", "off", "embed") e ignoramos el prefijo del espacio de nombres
 * ("p:", "a:", "r:"): los archivos reales casi siempre usan los mismos prefijos, pero el estándar
 * no lo garantiza, y así el lector no depende de ello.
 */

export function parseXml(text: string): Element {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  return document.documentElement
}

export function childElements(parent: Element | null | undefined, localName?: string): Element[] {
  if (!parent) return []
  return Array.from(parent.children).filter((child) => !localName || child.localName === localName)
}

export function child(parent: Element | null | undefined, localName: string): Element | null {
  return childElements(parent, localName)[0] ?? null
}

/** Sigue una ruta de hijos: path(sp, 'spPr', 'xfrm', 'off'). */
export function path(parent: Element | null | undefined, ...localNames: string[]): Element | null {
  let current: Element | null = parent ?? null
  for (const name of localNames) current = child(current, name)
  return current
}

/**
 * Descendientes con ese nombre local, en orden del documento. Recorremos el árbol a mano en vez
 * de `getElementsByTagName('*')`: esa lista es "viva" y en algunos DOM (jsdom, el de los tests)
 * recorrerla entera es cuadrático, lo que con un `styles.xml` de miles de elementos son segundos.
 */
export function descendants(parent: Element | null | undefined, localName: string): Element[] {
  const found: Element[] = []
  const visit = (element: Element): void => {
    for (let current = element.firstElementChild; current; current = current.nextElementSibling) {
      if (current.localName === localName) found.push(current)
      visit(current)
    }
  }
  if (parent) visit(parent)
  return found
}

/** Atributo por nombre local, con o sin prefijo ("embed" encuentra "r:embed"). */
export function attr(element: Element | null | undefined, localName: string): string | null {
  if (!element) return null
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.localName ?? attribute.name
    if (name === localName || attribute.name.endsWith(`:${localName}`)) return attribute.value
  }
  return null
}

/**
 * Atributo de relación ("r:id", "r:embed"): solo los que llevan prefijo. Hace falta porque
 * algunos elementos tienen a la vez `id` (su número) y `r:id` (el enlace a otro archivo del zip).
 */
export function relationAttr(element: Element | null | undefined, localName: string): string | null {
  if (!element) return null
  const attribute = Array.from(element.attributes).find(
    (candidate) => candidate.name.includes(':') && candidate.name.endsWith(`:${localName}`)
  )
  return attribute?.value ?? null
}

export function numberAttr(element: Element | null | undefined, localName: string): number | null {
  const value = attr(element, localName)
  if (value === null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** "ppt/slides/slide1.xml" + "../media/image1.png" -> "ppt/media/image1.png" (rutas dentro del zip). */
export function resolveZipPath(fromFile: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = fromFile.split('/').slice(0, -1)
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

/** Carpeta _rels del archivo: "ppt/slides/slide1.xml" -> "ppt/slides/_rels/slide1.xml.rels". */
export function relsPathFor(file: string): string {
  const parts = file.split('/')
  const name = parts.pop()
  return [...parts, '_rels', `${name}.rels`].join('/')
}

export interface Relationship {
  type: string
  /** Ruta dentro del zip, ya resuelta respecto al archivo que la declara. */
  target: string
}

/** Lee un archivo .rels: id -> relación. Las relaciones externas (enlaces web) se ignoran. */
export function readRelationships(rels: Element | null, filePath: string): Map<string, Relationship> {
  const map = new Map<string, Relationship>()
  for (const rel of childElements(rels, 'Relationship')) {
    const id = attr(rel, 'Id')
    const target = attr(rel, 'Target')
    if (id && target && attr(rel, 'TargetMode') !== 'External') {
      map.set(id, { type: attr(rel, 'Type') ?? '', target: resolveZipPath(filePath, target) })
    }
  }
  return map
}
