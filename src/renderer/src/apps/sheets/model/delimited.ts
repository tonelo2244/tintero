/**
 * Lectura y escritura de texto delimitado (CSV y el TSV del portapapeles), según RFC 4180:
 * un campo con separador, comillas o saltos de línea va entre comillas, y las comillas se duplican.
 */

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // El BOM que añaden Excel y nosotros al principio de un CSV UTF-8 no es parte del primer campo.
  if (text.charCodeAt(0) === 0xfeff) i = 1

  for (; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && field === '') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function serializeDelimited(rows: string[][], delimiter: string, lineBreak = '\r\n'): string {
  const needsQuotes = new RegExp(`["\\r\\n${delimiter === '\t' ? '\\t' : delimiter}]`)
  return rows
    .map((row) =>
      row.map((field) => (needsQuotes.test(field) ? `"${field.replace(/"/g, '""')}"` : field)).join(delimiter)
    )
    .join(lineBreak)
}

/** Adivina el separador mirando la primera línea (fuera de comillas): el más frecuente de ; , y tabulador. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '')
  const counts = [';', ',', '\t'].map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
  counts.sort((a, b) => b.count - a.count)
  return counts[0].count > 0 ? counts[0].delimiter : ','
}
