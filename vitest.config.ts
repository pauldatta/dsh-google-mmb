import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// Resolve DeepSeek Harness peer packages if running adjacent to deepseek-harness
const HARNESS_ROOT = process.env.DSH_REPO_ROOT || resolve(process.cwd(), '../deepseek-harness')
const hasAdjacentHarness = existsSync(HARNESS_ROOT)

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/*/tests/**/*.spec.ts'],
  },
  resolve: {
    alias: hasAdjacentHarness
      ? {
          '@deepseek-ai/cordis': resolve(HARNESS_ROOT, 'vendor/cordis/src'),
          '@deepseek-ai/cosmokit': resolve(HARNESS_ROOT, 'vendor/cosmokit/src'),
          '@deepseek-ai/schemastery': resolve(HARNESS_ROOT, 'vendor/schemastery/src'),
          '@deepseek-ai/dsh-tools': resolve(HARNESS_ROOT, 'packages/core/tools/src'),
          '@deepseek-ai/dsh-subagent': resolve(HARNESS_ROOT, 'packages/subagent/subagent/src'),
          '@deepseek-ai/dsh-system-prompt': resolve(HARNESS_ROOT, 'packages/core/system-prompt/src'),
          '@deepseek-ai/dsh-session': resolve(HARNESS_ROOT, 'packages/core/session/src'),
          '@deepseek-ai/dsh-llm': resolve(HARNESS_ROOT, 'packages/llm/llm/src'),
          '@deepseek-ai/dsh-invariants': resolve(HARNESS_ROOT, 'packages/runtime-diagnostics/invariants/src'),
          '@deepseek-ai/dsh-skill': resolve(HARNESS_ROOT, 'packages/skill/skill/src'),
          '@deepseek-ai/dsh-host-webserver': resolve(HARNESS_ROOT, 'packages/host/webserver/src'),
          '@deepseek-ai/dsh-subprocess': resolve(HARNESS_ROOT, 'packages/subprocess/subprocess/src'),
          '@deepseek-ai/dsh-timeout': resolve(HARNESS_ROOT, 'packages/util/timeout/src'),
          '@deepseek-ai/dsh-agent': resolve(HARNESS_ROOT, 'packages/core/agent/src'),
        }
      : {},
  },
})
