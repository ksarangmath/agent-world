import { ApiError, bearerToken, createOmnaraClient, type OmnaraClient } from '@omnara/sdk'

export type Omnara = {
  client: OmnaraClient
  path: { orgID: string; projectID: string }
}

const requestTimeoutMs = 4000

export function omnara(env: Env): Omnara {
  return {
    client: createOmnaraClient({
      baseUrl: 'https://api.omnara.com/v1',
      auth: bearerToken(env.OMNARA_TOKEN),
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
    }),
    path: { orgID: env.OMNARA_ORG_ID, projectID: env.OMNARA_PROJECT_ID },
  }
}

export const isPermanent = (error: unknown) =>
  error instanceof ApiError && [400, 404, 410, 422].includes(error.status)
