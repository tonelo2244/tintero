import type { EvalSuite } from '../lib/types'
import { presentationSuite } from './presentation'
import { proofreadSuite, rewriteSuite, summarizeSuite } from './writing'

/** Todas las suites, en el orden en que salen en el informe. */
export const SUITES: EvalSuite[] = [proofreadSuite, rewriteSuite, summarizeSuite, presentationSuite]
