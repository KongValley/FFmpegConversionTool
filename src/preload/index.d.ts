import type { MediaConverterApi } from '../shared/api'

declare global {
  interface Window {
    api: MediaConverterApi
  }
}

export {}
