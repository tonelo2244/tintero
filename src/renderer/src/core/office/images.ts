/**
 * Utilidades de imagen sin DOM. Las imágenes del editor se guardan como data URL (base64)
 * dentro del documento; los formatos de Office las guardan como archivos binarios en el zip.
 */

export type ImageKind = 'png' | 'jpg' | 'gif' | 'bmp'

export interface DecodedImage {
  kind: ImageKind
  bytes: Uint8Array
}

const MIME_BY_KIND: Record<ImageKind, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp'
}

/** Decodifica un data URL de imagen. null si no es un formato que Office entienda (p. ej. SVG o WebP). */
export function decodeImageDataUrl(src: string): DecodedImage | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(src)
  if (!match) return null
  const bytes = base64ToBytes(match[2])
  const kind = detectImageKind(bytes)
  return kind ? { kind, bytes } : null
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

export function mimeForKind(kind: ImageKind): string {
  return MIME_BY_KIND[kind]
}

/** Reconoce el formato por la "firma" de los primeros bytes, no por la extensión. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif'
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'bmp'
  return null
}

/** Tamaño en píxeles leyendo la cabecera del archivo. null si no se puede leer. */
export function imageSize({ kind, bytes }: DecodedImage): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    switch (kind) {
      case 'png':
        return { width: view.getUint32(16), height: view.getUint32(20) }
      case 'gif':
        return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
      case 'bmp':
        return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) }
      case 'jpg':
        return jpegSize(view)
    }
  } catch {
    return null
  }
}

/** En JPEG el tamaño está en el primer segmento SOF (Start Of Frame); hay que saltar los anteriores. */
function jpegSize(view: DataView): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null
    const marker = view.getUint8(offset + 1)
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isStartOfFrame) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
    offset += 2 + view.getUint16(offset + 2)
  }
  return null
}

/** Escala para que quepa en `maxWidth` sin deformar. */
export function fitWidth(size: { width: number; height: number }, maxWidth: number) {
  if (size.width <= maxWidth) return size
  return { width: maxWidth, height: Math.round((size.height * maxWidth) / size.width) }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}
