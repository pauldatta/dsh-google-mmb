/**
 * Package-owned invariant companion for `@google/dsh-llm-ollama`.
 * @module @google/dsh-llm-ollama/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@google/dsh-llm-ollama'

export const name = 'llm-ollama-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
