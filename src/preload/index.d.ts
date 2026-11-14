import type { TinteroApi } from '../shared/ipc'

declare global {
  interface Window {
    tintero: TinteroApi
  }
}

export {}
