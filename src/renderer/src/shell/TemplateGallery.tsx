import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { AppTemplate } from '@/core/appModule'

interface TemplateGalleryProps {
  title: string
  templates: AppTemplate<unknown>[]
  selectedId: string | undefined
  onSelect(id: string): void
  onCreate(template: AppTemplate<unknown>): void
}

export function TemplateGallery({ title, templates, selectedId, onSelect, onCreate }: TemplateGalleryProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <section className="gallery">
      <button type="button" className="section-toggle" onClick={() => setCollapsed((value) => !value)}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        {title}
      </button>
      {!collapsed && (
        <div className="gallery__grid">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`gallery__item ${template.id === selectedId ? 'is-selected' : ''}`}
              onClick={() => onSelect(template.id)}
              onDoubleClick={() => onCreate(template)}
              title="Doble clic para crear"
            >
              <div className="gallery__preview">
                <template.Preview />
              </div>
              <span className="gallery__label">{template.name}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
