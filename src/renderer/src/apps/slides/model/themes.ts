export interface SlideTheme {
  id: string
  name: string
  /** Cualquier valor CSS válido para `background`. */
  background: string
  titleColor: string
  textColor: string
  accentColor: string
  fontFamily: string
  titleFontFamily: string
}

const SANS = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif'

export const SLIDE_THEMES: SlideTheme[] = [
  {
    id: 'blank',
    name: 'Blanco',
    background: '#ffffff',
    titleColor: '#111111',
    textColor: '#222222',
    accentColor: '#c2410c',
    fontFamily: SANS,
    titleFontFamily: SANS
  },
  {
    id: 'bosque',
    name: 'Bosque',
    background: 'linear-gradient(90deg, #1c2a22 0%, #1f3326 78%, #6fa35a 78%, #b6d98c 100%)',
    titleColor: '#ffffff',
    textColor: '#e3eee5',
    accentColor: '#8cc06b',
    fontFamily: SANS,
    titleFontFamily: 'Georgia, serif'
  },
  {
    id: 'carmesi',
    name: 'Carmesí',
    background: 'linear-gradient(90deg, #c62f26 0%, #c62f26 2.5%, #ffffff 2.5%)',
    titleColor: '#c62f26',
    textColor: '#2b2b2b',
    accentColor: '#c62f26',
    fontFamily: SANS,
    titleFontFamily: '"Trebuchet MS", sans-serif'
  },
  {
    id: 'arena',
    name: 'Arena',
    background: 'linear-gradient(180deg, #f4efe6 0%, #e9dfcf 82%, #8a6a4a 82%, #5e4630 100%)',
    titleColor: '#4a3726',
    textColor: '#4a3f35',
    accentColor: '#a0784f',
    fontFamily: 'Georgia, serif',
    titleFontFamily: 'Garamond, "EB Garamond", Georgia, serif'
  },
  {
    id: 'pizarra',
    name: 'Pizarra',
    background: '#8796a0',
    titleColor: '#ffffff',
    textColor: '#f1f4f6',
    accentColor: '#2f3e48',
    fontFamily: SANS,
    titleFontFamily: SANS
  }
]

export function getTheme(id: string): SlideTheme {
  return SLIDE_THEMES.find((theme) => theme.id === id) ?? SLIDE_THEMES[0]
}
