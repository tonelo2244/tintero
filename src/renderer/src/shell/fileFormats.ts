import type { FileFilter } from '@shared/ipc'
import { extensionOf, type AnyAppModule, type AppRegistry, type Importer } from '@/core/appModule'

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

/** Cómo abrir un archivo según su extensión, decidido ANTES de leerlo. */
export type OpenPlan =
  | { kind: 'native' }
  | { kind: 'import'; app: AnyAppModule; importer: Importer<unknown> }
  | { kind: 'unsupported'; message: string }

/**
 * Decide por la extensión si el archivo es de Tintero, si hay que importarlo o si no sabemos abrirlo.
 * Sin este paso, cualquier archivo ajeno (un .txt, un PDF...) se leía como si fuera un .tdoc y el
 * usuario veía "JSON corrupto", que sugiere que su documento está dañado cuando no lo está.
 */
export function planOpen(registry: AppRegistry, path: string): OpenPlan {
  const extension = extensionOf(path)
  if (registry.all.some((app) => app.file.extension.toLowerCase() === extension)) return { kind: 'native' }

  const imported = registry.findImporter(extension)
  if (imported) return { kind: 'import', ...imported }

  const supported = openDialogFilters(registry)[0].extensions.map((ext) => `.${ext}`)
  const what = extension ? `archivos .${extension}` : 'archivos sin extensión'
  return { kind: 'unsupported', message: `Tintero no sabe abrir ${what}. Puede abrir ${listInSpanish(supported)}.` }
}

/** ['.a', '.b', '.c'] -> ".a, .b y .c" */
function listInSpanish(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}
