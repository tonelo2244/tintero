import { useState, type CSSProperties } from 'react'
import { FolderOpen, Search } from 'lucide-react'
import type { RecentFile } from '@shared/ipc'
import type { AnyAppModule, AppTemplate } from '@/core/appModule'
import { RecentFilesTable } from './RecentFilesTable'
import { TemplateGallery } from './TemplateGallery'
import { useRecents } from './useRecents'

interface LauncherProps {
  apps: readonly AnyAppModule[]
  activeApp: AnyAppModule
  onSelectApp(id: string): void
  onCreate(app: AnyAppModule, template: AppTemplate<unknown>): void
  onOpenDialog(): void
  onOpenRecent(recent: RecentFile): Promise<boolean>
}

/** Pantalla de inicio: barra lateral de apps + plantillas + recientes/anclados. */
export function Launcher({ apps, activeApp, onSelectApp, onCreate, onOpenDialog, onOpenRecent }: LauncherProps) {
  const { recents, setPinned, remove } = useRecents()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(activeApp.templates[0]?.id)
  const [query, setQuery] = useState('')

  const selectedTemplate =
    activeApp.templates.find((template) => template.id === selectedTemplateId) ?? activeApp.templates[0]

  const appRecents = recents.filter(
    (item) => item.appId === activeApp.id && item.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  const handleOpenRecent = async (recent: RecentFile) => {
    const opened = await onOpenRecent(recent)
    if (!opened && window.confirm(`No se encontró "${recent.name}". ¿Quitarlo de la lista de recientes?`)) {
      await remove(recent.path)
    }
  }

  const selectApp = (id: string) => {
    onSelectApp(id)
    setSelectedTemplateId(undefined)
    setQuery('')
  }

  return (
    <div className="launcher" style={{ '--accent': activeApp.accentColor } as CSSProperties}>
      <nav className="launcher__rail" aria-label="Aplicaciones">
        <div className="launcher__brand">Tintero</div>
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            className={`rail-button ${app.id === activeApp.id ? 'is-active' : ''}`}
            style={{ '--accent': app.accentColor } as CSSProperties}
            onClick={() => selectApp(app.id)}
          >
            <app.Icon size={24} />
            <span>{app.shortName}</span>
          </button>
        ))}
        <div className="launcher__rail-spacer" />
        <button type="button" className="rail-button" onClick={onOpenDialog}>
          <FolderOpen size={24} />
          <span>Abrir</span>
        </button>
      </nav>

      <main className="launcher__main">
        <header className="launcher__header">
          <h1>{activeApp.name}</h1>
          <label className="search-box">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en recientes" />
          </label>
        </header>

        <div className="launcher__scroll">
          <TemplateGallery
            title={activeApp.galleryTitle}
            templates={activeApp.templates}
            selectedId={selectedTemplate?.id}
            onSelect={setSelectedTemplateId}
            onCreate={(template) => onCreate(activeApp, template)}
          />

          <RecentFilesTable
            items={appRecents}
            fileLabel={activeApp.file.label}
            Icon={activeApp.Icon}
            onOpen={handleOpenRecent}
            onTogglePin={(item) => void setPinned(item.path, !item.pinned)}
            onRemove={(item) => void remove(item.path)}
          />
        </div>

        <footer className="launcher__footer">
          <button type="button" className="button" onClick={onOpenDialog}>
            Abrir otro…
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!selectedTemplate}
            onClick={() => selectedTemplate && onCreate(activeApp, selectedTemplate)}
          >
            Crear
          </button>
        </footer>
      </main>
    </div>
  )
}
