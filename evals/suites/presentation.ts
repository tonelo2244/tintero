import { generateStructured } from '@/core/ai/structured'
import { extractNumbers, ungroundedNumbers } from '@/core/ai/grounding'
import { buildOutlineRequest, parseOutline } from '@/apps/slides/model/outline'
import cases from '../cases/presentation.json'
import { check, containsAll } from '../lib/checks'
import { defineSuite, type EvalCase } from '../lib/types'

interface PresentationCase extends EvalCase {
  input: string
  mustMention: string[]
  minSlides: number
  maxSlides: number
}

/**
 * Crear presentación: aquí casi todo es determinista. El JSON valida o no (parseOutline, el mismo
 * validador de la app), el número de diapositivas está o no en el rango, y las cifras de la
 * presentación salen del documento o son inventadas.
 */
export const presentationSuite = defineSuite<PresentationCase>({
  id: 'presentacion',
  description: 'Crear una presentación desde un documento (JSON con esquema)',
  structured: true,
  cases,
  async run(testCase, context) {
    const outline = await generateStructured(context.ai, buildOutlineRequest(testCase.input), parseOutline)
    const allText = [outline.title, outline.subtitle, ...outline.slides.flatMap((s) => [s.title, ...s.bullets])].join(
      '\n'
    )
    const invented = ungroundedNumbers(allText, extractNumbers(testCase.input))
    const count = outline.slides.length
    const checks = [
      check(
        `entre ${testCase.minSlides} y ${testCase.maxSlides} diapositivas`,
        count >= testCase.minSlides && count <= testCase.maxSlides,
        `salieron ${count}`
      ),
      check(
        'cada diapositiva tiene puntos',
        outline.slides.every((slide) => slide.bullets.length >= 2),
        outline.slides.map((slide) => slide.bullets.length).join(', ')
      ),
      check(
        'notas del orador',
        outline.slides.every((slide) => slide.notes.length > 0)
      ),
      containsAll(allText, testCase.mustMention, 'menciona lo esencial'),
      check(
        'sin cifras inventadas',
        invented.length === 0,
        invented.length ? `inventa: ${invented.join(', ')}` : undefined
      )
    ]
    return { output: JSON.stringify(outline, null, 2), checks }
  }
})
