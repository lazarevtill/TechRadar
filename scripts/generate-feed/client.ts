import Anthropic from '@anthropic-ai/sdk'
import type { ClientOptions } from '@anthropic-ai/sdk'

/**
 * Builds the client options for the digest pipeline.
 *
 * ANTHROPIC_WORKSPACE_ID is optional and only needed for org-level API keys,
 * which are not bound to a workspace — the API rejects those with
 * "This API key is not scoped to a workspace..." unless the header is present.
 * A workspace-scoped key carries that association implicitly and needs none.
 *
 * Split out from createClient so it can be asserted on directly, rather than
 * reaching into the SDK's private fields.
 */
export function buildClientOptions(
  env: NodeJS.ProcessEnv = process.env,
): ClientOptions {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required (set as a GitHub Actions secret)',
    )
  }

  const workspaceId = env.ANTHROPIC_WORKSPACE_ID
  return {
    apiKey,
    maxRetries: 3,
    ...(workspaceId
      ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } }
      : {}),
  }
}

export function createClient(env: NodeJS.ProcessEnv = process.env): Anthropic {
  return new Anthropic(buildClientOptions(env))
}
