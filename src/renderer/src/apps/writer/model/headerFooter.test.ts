import { describe, expect, it } from 'vitest'
import { headerFooterForPage, variantForPage, withHeaderFooterPart, withVariantEnabled } from './headerFooter'

const footer = { text: 'Página {página}', align: 'center' as const }

describe('variantes de encabezado y pie', () => {
  it('sin opciones, todas las hojas usan el mismo', () => {
    const parts = { footer }
    expect(variantForPage(parts, 1)).toBe('default')
    expect(headerFooterForPage(parts, 2)).toEqual({ header: undefined, footer })
  })

  it('primera página diferente: la primera va sin nada hasta que se escriba algo', () => {
    const parts = withVariantEnabled({ footer }, 'first', true)
    expect(variantForPage(parts, 1)).toBe('first')
    expect(headerFooterForPage(parts, 1)).toEqual({})
    expect(headerFooterForPage(parts, 2).footer).toEqual(footer)
    const withTitle = withHeaderFooterPart(parts, 'first', 'header', { text: 'Portada', align: 'right' })
    expect(headerFooterForPage(withTitle, 1).header?.text).toBe('Portada')
  })

  it('pares e impares: las pares usan el suyo', () => {
    const parts = withHeaderFooterPart(withVariantEnabled({ footer }, 'even', true), 'even', 'footer', {
      text: 'Par',
      align: 'left'
    })
    expect(headerFooterForPage(parts, 2).footer?.text).toBe('Par')
    expect(headerFooterForPage(parts, 3).footer).toEqual(footer)
    expect(withVariantEnabled(parts, 'even', false).evenPages).toBeUndefined()
  })

  it('quitar el texto de la variante normal quita la parte', () => {
    expect(withHeaderFooterPart({ footer }, 'default', 'footer', undefined)).toEqual({})
  })
})
