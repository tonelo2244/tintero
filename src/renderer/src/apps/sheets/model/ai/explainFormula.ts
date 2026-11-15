import type { AiGenerateRequest } from '@shared/ai'

/**
 * «¿Qué hace =SUMAR.SI(A2:A20;">10";B2:B20)?». Lo inverso de naturalFormula: texto libre en
 * streaming. Le damos al modelo la fórmula tal y como la ve el usuario (en español) y el resumen
 * de la hoja, para que hable de "la columna Ventas" y no de "el rango B2:B20".
 */
const SYSTEM_PROMPT = [
  'Explicas fórmulas de hoja de cálculo a personas que no saben de fórmulas.',
  'Recibirás la fórmula, la celda donde está, su resultado y un resumen de la hoja.',
  'Explica en 2 a 4 frases qué calcula, nombrando las columnas por su cabecera cuando la haya.',
  'Si la fórmula tiene un problema evidente (un rango que se queda corto, un error), dilo en una frase al final.',
  'Responde solo con la explicación, en español, sin repetir la fórmula entera ni usar Markdown.'
].join('\n')

export interface ExplainInput {
  localizedFormula: string
  address: string
  result: string
  sheetDescription: string
}

export function buildExplainRequest(input: ExplainInput): AiGenerateRequest {
  return {
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          input.sheetDescription,
          `Celda ${input.address}: ${input.localizedFormula}`,
          `Resultado actual: ${input.result || '(vacío)'}`
        ].join('\n\n')
      }
    ]
  }
}
