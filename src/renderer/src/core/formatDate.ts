const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

const pad = (value: number) => value.toString().padStart(2, '0')
const time = (date: Date) => `${date.getHours()}:${pad(date.getMinutes())}`

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Fecha relativa al estilo de las suites ofimáticas:
 * "hoy, 9:05", "ayer, 15:47", "lun a las 0:20", "2 nov", "2 nov 2024".
 */
export function formatLastOpened(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (days === 0) return `hoy, ${time(date)}`
  if (days === 1) return `ayer, ${time(date)}`
  if (days > 1 && days < 7) return `${WEEKDAYS[date.getDay()]} a las ${time(date)}`
  const sameYear = date.getFullYear() === now.getFullYear()
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${sameYear ? '' : ` ${date.getFullYear()}`}`
}
