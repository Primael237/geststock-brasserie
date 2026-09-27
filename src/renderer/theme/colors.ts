// Palette de marque GestStock Brasserie — extraite de l'icône g3
export const brandColors = {
  emerald: '#0F9D74',
  emeraldLight: '#12A17A',
  emeraldDark: '#086B4E',
  emeraldDeep: '#0B5C42',
  gold: '#FDAF08',
  goldLight: '#F4CF53',
  amber: '#F28D0C',
  amberDark: '#ED6A11',
  brown: '#451008',
  cream: '#F3E7C9',
} as const

export type BrandColor = keyof typeof brandColors
