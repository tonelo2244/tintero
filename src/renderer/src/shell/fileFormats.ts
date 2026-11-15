import type { FileFilter } from '@shared/ipc'
import type { AppRegistry } from '@/core/appModule'

/**
 * Filtros del diálogo "Abrir": primero todo lo que la suite sabe abrir, luego cada tipo por separado.
 * Así el usuario ve sus .docx sin tener que cambiar de filtro.
 */
export function openDialogFilters(registry: AppRegistry): FileFilter[] {
  const native = registry.all.map((app) => ({ name: app.file.label, extensions: [app.file.extension] }))
  const external = registry.all.flatMap((app) =>
    (app.importers ?? []).map((importer) => ({
      name: importer.format.label,
      extensions: [importer.format.extension]
    }))
  )
  const allExtensions = [...native, ...external].flatMap((filter) => filter.extensions)
  return [
    { name: 'Todos los documentos compatibles', extensions: allExtensions },
    { name: 'Documentos de Tintero', extensions: native.flatMap((filter) => filter.extensions) },
    ...native,
    ...external
  ]
}

/** Aviso tras importar: deja claro que el original no se toca y qué se ha perdido. */
export function importNotice(fileName: string, nativeExtension: string, warnings: string[]): string {
  const opened = `Has abierto una copia de "${fileName}"; al guardar se creará un archivo .${nativeExtension} y el original no se modifica.`
  if (warnings.length === 0) return opened
  return `${opened} No se han podido conservar: ${warnings.join('; ')}.`
}
