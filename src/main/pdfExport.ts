import type { PrintToPDFOptions } from 'electron'

/**
 * Opciones de `webContents.printToPDF`. Viven aparte para que el proceso principal siga sin
 * saber nada de cada app: es la propia interfaz quien declara el tamaño de página con CSS
 * (`@page`), y aquí solo le decimos a Chromium que lo respete.
 */
export const PDF_OPTIONS: PrintToPDFOptions = {
  // Sin esto se pierden los fondos (temas de diapositivas, resaltados de texto).
  printBackground: true,
  // Texto define A4 vertical y Diapositivas A4 horizontal con @page.
  preferCSSPageSize: true,
  // Si una vista no declarara @page, mejor A4 (Europa) que el Carta por defecto de Chromium.
  pageSize: 'A4'
}
