import { ApiError, bearerToken, createOmnaraClient, type OmnaraClient } from '@omnara/sdk'
import type { Metro } from '../../shared/metros'

export type Omnara = {
  client: OmnaraClient
  path: { orgID: string; projectID: string }
}

const requestTimeoutMs = 10_000

export function omnara(env: Env): Omnara {
  return {
    client: createOmnaraClient({
      baseUrl: 'https://api.omnara.com/v1',
      auth: bearerToken(env.OMNARA_TOKEN),
      timeoutMs: requestTimeoutMs,
    }),
    path: { orgID: env.OMNARA_ORG_ID, projectID: env.OMNARA_PROJECT_ID },
  }
}

export const worldProfileId = (env: Env, metro: Metro) =>
  ({ bay: env.OMNARA_WORLD_PROFILE_ID, austin: env.OMNARA_AUSTIN_WORLD_PROFILE_ID })[metro]

export const isPermanent = (error: unknown) =>
  error instanceof ApiError && [400, 404, 410, 422].includes(error.status)

export const isGone = (error: unknown) =>
  error instanceof ApiError && [404, 410].includes(error.status)
