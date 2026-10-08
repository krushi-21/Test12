import type { IncomingMessage, ServerResponse } from 'node:http'

export interface SyntheticPreviewProxyGuardOptions {
  origin: string
  now?: () => number
  windowMs?: number
  maxRequests?: number
  maxMutatingRequests?: number
  maxClients?: number
}

export function createSyntheticPreviewProxyGuard(
  options: SyntheticPreviewProxyGuardOptions
): (req: IncomingMessage, res: ServerResponse, next: (error?: Error) => void) => void
