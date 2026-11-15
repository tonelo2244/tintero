import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiGenerateRequest, AiToolCall, AiToolDefinition } from '@shared/ai'
import { platform } from '@/core/platform'
import { AiCancelledError } from './structured'
import { proposeToolCalls, type Interpretation, type ToolProposal } from './tools'
import { errorMessage } from './useAiGeneration'

export type ToolAgentJob<A> =
  | { phase: 'asking'; request: string }
  | { phase: 'running'; request: string }
  | { phase: 'done'; request: string; proposal: ToolProposal<A> }
  | { phase: 'error'; request: string; message: string }

interface ToolAgentOptions<S, A> {
  /** Estado actual del documento (se lee al pedir y al aplicar). */
  getState(): S
  buildRequest(state: S, request: string): AiGenerateRequest & { tools: AiToolDefinition[] }
  interpret(state: S, calls: AiToolCall[]): Interpretation<A>
  /** Aplica todas las acciones como un solo paso de deshacer. */
  applyActions(actions: A[]): void
}

/**
 * Estado de la interfaz del agente con herramientas, igual para Diapositivas y Hojas: escribir
 * la petición, esperar la propuesta, revisarla y aplicarla o descartarla.
 */
export function useToolAgent<S, A>(options: ToolAgentOptions<S, A>) {
  const [job, setJob] = useState<ToolAgentJob<A> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  /** Estado sobre el que se calculó la propuesta: si cambia, la propuesta ya no vale. */
  const baseRef = useRef<S | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const open = useCallback(() => {
    controllerRef.current?.abort()
    setJob((current) => ({ phase: 'asking', request: current?.request ?? '' }))
  }, [])

  const setRequest = useCallback((request: string) => {
    setJob((current) =>
      current && (current.phase === 'asking' || current.phase === 'error') ? { phase: 'asking', request } : current
    )
  }, [])

  const propose = useCallback(async (request: string) => {
    const text = request.trim()
    if (!text) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const { getState, buildRequest, interpret } = optionsRef.current
    const state = getState()
    baseRef.current = state
    setJob({ phase: 'running', request: text })
    try {
      const proposal = await proposeToolCalls(
        platform.ai,
        buildRequest(state, text),
        (calls) => interpret(state, calls),
        {
          signal: controller.signal
        }
      )
      if (!controller.signal.aborted) setJob({ phase: 'done', request: text, proposal })
    } catch (error) {
      if (error instanceof AiCancelledError) setJob({ phase: 'asking', request: text })
      else setJob({ phase: 'error', request: text, message: errorMessage(error) })
    }
  }, [])

  const apply = useCallback(() => {
    if (job?.phase !== 'done') return
    const { getState, applyActions } = optionsRef.current
    if (getState() !== baseRef.current) {
      setJob({
        phase: 'error',
        request: job.request,
        message: 'El documento ha cambiado mientras tanto. Vuelve a pedir los cambios.'
      })
      return
    }
    applyActions(job.proposal.steps.flatMap((step) => step.actions))
    setJob(null)
  }, [job])

  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  const close = useCallback(() => {
    controllerRef.current?.abort()
    setJob(null)
  }, [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  return { job, open, setRequest, propose, apply, cancel, close }
}

export type ToolAgent<A> = ReturnType<typeof useToolAgent<unknown, A>>
