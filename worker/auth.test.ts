import { expect, test } from 'vitest'
import app from './index'

const env = { VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_PUBLISHABLE_KEY: 'test' }

test.each([undefined, 'Basic abc', 'Bearer', 'Bearer not-a-jwt', 'Bearer a.b.c'])(
  'rejects Authorization %s',
  async (authorization) => {
    const headers: Record<string, string> = authorization ? { Authorization: authorization } : {}
    const response = await app.request('/api/me', { headers }, env)
    expect(response.status).toBe(401)
  },
)
