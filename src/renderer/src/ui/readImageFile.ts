const MAX_IMAGE_BYTES = 15 * 1024 * 1024

/**
 * Lee una imagen como data URL. Se incrusta en el documento para que el archivo
 * sea autocontenido (puedes moverlo de carpeta sin perder imágenes).
 * Trade-off: archivos más pesados que si guardáramos solo la ruta.
 */
export function readImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('El archivo no es una imagen.'))
  if (file.size > MAX_IMAGE_BYTES) return Promise.reject(new Error('La imagen supera los 15 MB.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
