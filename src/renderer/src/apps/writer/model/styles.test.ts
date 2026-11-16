import { describe, expect, it } from 'vitest'
import {
  customStyleId,
  DEFAULT_STYLES,
  isDefaultStyles,
  normalizeStyles,
  removeStyle,
  resolveStyle,
  styleSelector,
  stylesCss,
  upsertStyle,
  type WriterStyle
} from './styles'

const custom = (overrides: Partial<WriterStyle>): WriterStyle => ({
  id: 'custom-a',
  name: 'A',
  type: 'paragraph',
  props: {},
  ...overrides
})

describe('resolveStyle', () => {
  it('un título hereda de Normal lo que no define', () => {
    const props = resolveStyle(DEFAULT_STYLES, 'heading-1')
    expect(props.fontSize).toBe(16)
    expect(props.fontFamily).toBe(resolveStyle(DEFAULT_STYLES, 'normal').fontFamily)
    expect(props.outlineLevel).toBe(1)
  })

  it('sigue la cadena "basado en" y no se cuelga con un ciclo', () => {
    const styles = [
      ...DEFAULT_STYLES,
      custom({ id: 'custom-a', basedOn: 'custom-b', props: { color: '#ff0000' } }),
      custom({ id: 'custom-b', basedOn: 'custom-a', props: { fontSize: 20, color: '#00ff00' } })
    ]
    expect(resolveStyle(styles, 'custom-a')).toMatchObject({ fontSize: 20, color: '#ff0000' })
  })

  it('un estilo de carácter solo tiene lo suyo (no hereda la letra de Normal)', () => {
    expect(resolveStyle(DEFAULT_STYLES, 'emphasis')).toEqual({ italic: true })
  })
})

describe('stylesCss', () => {
  it('cada estilo tiene su selector y sus propiedades resueltas', () => {
    const css = stylesCss(DEFAULT_STYLES)
    expect(styleSelector(DEFAULT_STYLES.find((style) => style.id === 'quote')!)).toBe(
      ".writer-content p[data-style='quote']"
    )
    expect(css).toContain('.writer-content h1 {')
    expect(css).toMatch(/\.writer-content h1 \{[^}]*font-size: 16pt[^}]*margin-top: 18pt/)
    expect(css).toContain(".writer-content [data-char-style='emphasis'] { font-style: italic }")
  })

  it('cambiar un estilo cambia su regla sin tocar las demás', () => {
    const changed = upsertStyle(DEFAULT_STYLES, {
      ...DEFAULT_STYLES.find((style) => style.id === 'heading-2')!,
      props: { fontSize: 20, color: '#c00000', outlineLevel: 2 }
    })
    const css = stylesCss(changed)
    expect(css).toMatch(/h2 \{[^}]*font-size: 20pt; color: #c00000/)
    expect(css).toMatch(/h1 \{[^}]*font-size: 16pt/)
  })

  it('los títulos numerados usan contadores 1, 1.1, 1.1.1', () => {
    const css = stylesCss(DEFAULT_STYLES, true)
    expect(css).toContain('.writer-content h2 { counter-increment: h2; counter-reset: h3 h4 h5 h6 }')
    expect(css).toContain('h3::before { content: counter(h1) "." counter(h2) "." counter(h3)')
  })
})

describe('gestión de estilos', () => {
  it('ids personalizados legibles y únicos', () => {
    expect(customStyleId('Nota al margen', DEFAULT_STYLES)).toBe('custom-nota-al-margen')
    const styles = [...DEFAULT_STYLES, custom({ id: 'custom-nota' })]
    expect(customStyleId('Nota', styles)).toBe('custom-nota-2')
  })

  it('borrar un estilo no deja huérfanos a los que se basaban en él', () => {
    const styles = [
      ...DEFAULT_STYLES,
      custom({ id: 'custom-a', basedOn: 'heading-1', props: { color: '#ff0000' } }),
      custom({ id: 'custom-b', basedOn: 'custom-a', props: { italic: true } })
    ]
    const after = removeStyle(styles, 'custom-a')
    expect(after.find((style) => style.id === 'custom-b')).toMatchObject({
      basedOn: 'heading-1',
      props: { color: '#ff0000', italic: true }
    })
    // Los integrados no se borran.
    expect(removeStyle(DEFAULT_STYLES, 'normal')).toBe(DEFAULT_STYLES)
  })

  it('normalizeStyles completa los integrados que falten y descarta lo inválido', () => {
    const styles = normalizeStyles([
      { id: 'heading-1', name: 'Título 1', type: 'paragraph', props: { fontSize: 22, color: 'rojo' } },
      { id: 'MAL id', name: 'x', props: {} },
      { id: 'custom-x', name: 'X', type: 'character', props: { bold: true, fontSize: 'grande' } }
    ])!
    expect(styles.find((style) => style.id === 'heading-1')?.props).toEqual({ fontSize: 22 })
    expect(styles.find((style) => style.id === 'normal')).toBeDefined()
    expect(styles.at(-1)).toEqual({ id: 'custom-x', name: 'X', type: 'character', props: { bold: true } })
    expect(normalizeStyles('nada')).toBeNull()
    expect(isDefaultStyles(normalizeStyles(DEFAULT_STYLES)!)).toBe(true)
  })
})
