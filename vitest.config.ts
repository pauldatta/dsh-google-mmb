import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { standardDecoratorPlugin, vitestExecArgv } from '../deepseek-harness/vitest.shared.ts'

const HARNESS_ROOT = process.env.DSH_REPO_ROOT || resolve(process.cwd(), '../deepseek-harness')
const hasAdjacentHarness = existsSync(HARNESS_ROOT)

function buildHarnessAliases(): Record<string, string> {
  if (!hasAdjacentHarness) return {}
  const tsconfigPath = resolve(HARNESS_ROOT, 'tsconfig.base.json')
  const raw = readFileSync(tsconfigPath, 'utf8').replace(/^\s*\/\/.*$/gm, '')
  const parsed = JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, string[]> } }
  const paths = parsed.compilerOptions?.paths ?? {}
  const aliases: Record<string, string> = {}
  for (const [key, targets] of Object.entries(paths)) {
    const target = targets[0]
    if (!target || key.includes('*')) continue
    const resolved = resolve(HARNESS_ROOT, target)
    const pkgDir = resolved.replace(/\/src(?:\/index\.ts)?$/, '')
    const libIndex = resolve(pkgDir, 'lib/index.js')
    if (existsSync(libIndex)) {
      aliases[key] = libIndex
    } else if (existsSync(resolve(resolved, 'index.ts'))) {
      aliases[key] = resolve(resolved, 'index.ts')
    } else {
      aliases[key] = resolved
    }
  }
  return aliases
}

export default defineConfig({
  plugins: [standardDecoratorPlugin],
  test: {
    environment: 'node',
    globals: true,
    execArgv: vitestExecArgv,
    include: ['packages/*/tests/**/*.spec.ts'],
  },
  resolve: {
    alias: buildHarnessAliases(),
  },
})
