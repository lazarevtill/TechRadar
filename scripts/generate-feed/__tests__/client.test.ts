import { describe, it, expect } from 'vitest'
import { buildClientOptions } from '../client'

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv

describe('buildClientOptions', () => {
  it('fails fast without a key', () => {
    expect(() => buildClientOptions(env({}))).toThrow(
      /ANTHROPIC_API_KEY is required/,
    )
  })

  it('omits the workspace header for a workspace-scoped key', () => {
    const o = buildClientOptions(env({ ANTHROPIC_API_KEY: 'sk-ant-test' }))
    expect(o.defaultHeaders).toBeUndefined()
    expect(o.maxRetries).toBe(3)
  })

  // Org-level keys are rejected by the API without this header.
  it('sends the workspace header when one is configured', () => {
    const o = buildClientOptions(
      env({
        ANTHROPIC_API_KEY: 'sk-ant-test',
        ANTHROPIC_WORKSPACE_ID: 'wrkspc_test',
      }),
    )
    expect(o.defaultHeaders).toEqual({
      'anthropic-workspace-id': 'wrkspc_test',
    })
  })
})
