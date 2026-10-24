/**
 * First-class local & remote Ollama LLM provider plugin for DeepSeek Harness (`0.2.1-rc.3`).
 *
 * Registers the `'ollama'` provider route, configurable provider directory metadata,
 * dynamic `/api/tags` + `/v1/models` model discovery, NDJSON `/api/chat` streaming,
 * and the `ollama_models` / `ollama_status` runtime diagnostic tools.
 *
 * @module @google/dsh-llm-ollama
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, type ToolsService } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import {
  OllamaAdapter,
  ThinkingTagParser,
  inferModelCapabilities,
  normalizeOllamaBaseUrl,
  type InferredModelCapabilities,
  type OllamaAdapterDependencies,
  type OllamaStatusResult,
} from './adapter.ts'
import {
  DEFAULT_OLLAMA_MODELS,
  type OllamaChatMessage,
  type OllamaChatRequest,
  type OllamaChatStreamChunk,
  type OllamaModelCatalogEntry,
  type OllamaPluginConfig,
  type OllamaPsResponse,
  type OllamaRunningModel,
  type OllamaShowResponse,
  type OllamaTagModel,
  type OllamaTagModelDetails,
  type OllamaTagsResponse,
  type OllamaToolCall,
  type OllamaToolDefinition,
  type OllamaVersionResponse,
} from './types.ts'

export const name = 'llm-ollama'
export const inject = ['llm']

export const Config: z<OllamaPluginConfig> = z.object({
  provider: z.string().default('ollama'),
  displayName: z.string().default('Ollama (Local)'),
  baseUrl: z.string(),
  baseURL: z.string(),
  apiKey: z.string(),
  apiKeyEnv: z.string().default('OLLAMA_API_KEY'),
  defaultModel: z.string().default('qwen3:32b'),
  contextWindow: z.number().default(131072),
  defaultContextWindow: z.number(),
  defaultMaxTokens: z.number().default(16384),
  maxTokens: z.number(),
  timeoutMs: z.number().default(300_000),
  discoveryTimeoutMs: z.number().default(5_000),
  keepAlive: z.string(),
  enableTools: z.boolean().default(true),
  registerTools: z.boolean().default(true),
  injectSystemPrompt: z.boolean().default(true),
  enrichWithShow: z.boolean().default(true),
})

export const OLLAMA_SYSTEM_PROMPT = `You have access to local and self-hosted open-weight models through the Ollama provider (\`provider: "ollama"\`) and the \`ollama_models\` / \`ollama_status\` tools.
Use \`ollama_status\` to check whether the local Ollama daemon (\`http://127.0.0.1:11434\` or \`OLLAMA_HOST\`) is online and which models are currently loaded in VRAM, or \`ollama_models\` to list locally pulled and supported catalog models (such as \`qwen3:32b\`, \`deepseek-r1:32b\`, \`llama3.3:70b\`, \`gemma3:27b\`, and \`qwen2.5-coder:32b\`).`

function registerOllamaTools(tools: ToolsService, adapter: OllamaAdapter): Array<() => void> {
  const disposers: Array<() => void> = []

  const disposeModelsTool = tools.register(
    defineTool({
      name: 'ollama_models',
      description:
        'List locally installed Ollama models discovered from GET /api/tags (or the built-in fallback catalog when the local Ollama daemon is offline), including context window, parameter size, quantization, vision, thinking, and tool-calling capabilities.',
      parameters: {
        include_fallback: {
          type: 'boolean',
          description:
            'When true (default), returns the built-in 5-model default catalog if the local Ollama daemon is offline.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            online: { type: 'boolean' },
            baseUrl: { type: 'string' },
            models: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  contextWindow: { type: 'number' },
                  inputModalities: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  thinking: { type: 'boolean' },
                  tools: { type: 'boolean' },
                  parameterSize: { type: 'string' },
                  quantizationLevel: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: JSON.stringify(value, null, 2),
          },
        ],
      },
      async execute(args, exec) {
        const includeFallback =
          typeof args.include_fallback === 'boolean' ? args.include_fallback : true
        return adapter.getModelsToolPayload(includeFallback, exec?.signal)
      },
    }),
  )
  if (typeof disposeModelsTool === 'function') disposers.push(disposeModelsTool)

  const disposeStatusTool = tools.register(
    defineTool({
      name: 'ollama_status',
      description:
        'Check the health, version, installed models, and active VRAM models of the local or configured Ollama daemon (http://127.0.0.1:11434 or OLLAMA_HOST).',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            online: { type: 'boolean' },
            baseUrl: { type: 'string' },
            version: { type: 'string' },
            installedModelsCount: { type: 'number' },
            installedModels: {
              type: 'array',
              items: { type: 'string' },
            },
            runningModels: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  sizeVramBytes: { type: 'number' },
                  expiresAt: { type: 'string' },
                },
              },
            },
            message: { type: 'string' },
          },
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: JSON.stringify(value, null, 2),
          },
        ],
      },
      async execute(_args, exec) {
        return adapter.getDaemonStatus(exec?.signal)
      },
    }),
  )
  if (typeof disposeStatusTool === 'function') disposers.push(disposeStatusTool)

  return disposers
}

export function apply(ctx: Context, config: OllamaPluginConfig = {}): () => void {
  const safeGet = <T>(serviceName: string, targetCtx: Context = ctx): T | undefined => {
    if (typeof targetCtx?.get === 'function') {
      try {
        const resolved = targetCtx.get(serviceName as never) as T | undefined
        if (resolved !== undefined) return resolved
      } catch {
        // Fall through to guarded property access for plain mock contexts
      }
    }
    try {
      return (targetCtx as unknown as Record<string, T | undefined>)?.[serviceName]
    } catch {
      return undefined
    }
  }

  const adapter = new OllamaAdapter({
    config,
    resolveAttachments: () => safeGet<AttachmentStore>('attachments'),
  })

  const settingsNs =
    (ctx as unknown as { fiber?: { entry?: { options?: { id?: string } } } }).fiber?.entry?.options?.id
    ?? name

  const disposers: Array<() => void> = []

  const llm = safeGet<Context['llm']>('llm')
  if (llm) {
    if (typeof llm.registerConfigurableProviders === 'function') {
      const disposeDir = llm.registerConfigurableProviders([
        {
          provider: adapter.providerId,
          displayName: adapter.displayName,
          settingsNs,
          settingsPath: [],
          declared: false,
          defaultBaseURL: adapter.baseUrl,
          baseURLEnv: ['OLLAMA_HOST'],
          nativeAuth: {
            env: [config.apiKeyEnv ?? 'OLLAMA_API_KEY'],
            oauth: false,
          },
        },
      ])
      if (typeof disposeDir === 'function') disposers.push(disposeDir)
    }

    if (typeof llm.registerModelDiscovery === 'function') {
      const disposeDiscovery = llm.registerModelDiscovery(
        settingsNs,
        (request, signal) => adapter.discoverModels(request, signal),
      )
      if (typeof disposeDiscovery === 'function') disposers.push(disposeDiscovery)
    }

    if (typeof llm.registerAdapter === 'function') {
      const disposeAdapter = llm.registerAdapter([adapter.providerId], adapter)
      if (typeof disposeAdapter === 'function') disposers.push(disposeAdapter)
    }
  }

  const shouldEnableTools = config.enableTools !== false && config.registerTools !== false
  if (shouldEnableTools) {
    const tools = safeGet<ToolsService>('tools')
    if (tools && typeof tools.register === 'function') {
      disposers.push(...registerOllamaTools(tools, adapter))
    } else if (typeof ctx.inject === 'function') {
      ctx.inject(['tools'], (childCtx) => {
        const injectedTools =
          safeGet<ToolsService>('tools', childCtx) ?? safeGet<ToolsService>('tools')
        if (injectedTools && typeof injectedTools.register === 'function') {
          const toolDisposers = registerOllamaTools(injectedTools, adapter)
          disposers.push(...toolDisposers)
          return () => {
            while (toolDisposers.length > 0) {
              try {
                toolDisposers.pop()?.()
              } catch {
                // Ignore individual disposal errors
              }
            }
          }
        }
      })
    }
  }

  if (config.injectSystemPrompt !== false) {
    const registerPromptSection = (
      systemPrompt: Context['systemPrompt'] | undefined,
    ): (() => void) | undefined => {
      if (systemPrompt && typeof systemPrompt.section === 'function') {
        const disposePrompt = systemPrompt.section({
          name: 'llm:ollama',
          order: 125,
          text: OLLAMA_SYSTEM_PROMPT,
        })
        if (typeof disposePrompt === 'function') {
          disposers.push(disposePrompt)
          return disposePrompt
        }
      }
      return undefined
    }

    const systemPrompt = safeGet<Context['systemPrompt']>('systemPrompt')
    if (systemPrompt && typeof systemPrompt.section === 'function') {
      registerPromptSection(systemPrompt)
    } else if (typeof ctx.inject === 'function') {
      ctx.inject(['systemPrompt'], (childCtx) => {
        const injectedSystemPrompt =
          safeGet<Context['systemPrompt']>('systemPrompt', childCtx)
          ?? safeGet<Context['systemPrompt']>('systemPrompt')
        const disposePrompt = registerPromptSection(injectedSystemPrompt)
        return () => {
          try {
            disposePrompt?.()
          } catch {
            // Ignore individual disposal errors
          }
        }
      })
    }
  }

  const cleanup = (): void => {
    while (disposers.length > 0) {
      const dispose = disposers.pop()
      try {
        dispose?.()
      } catch {
        // Ignore individual disposal errors
      }
    }
  }

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => cleanup)
  }

  return cleanup
}

export {
  DEFAULT_OLLAMA_MODELS,
  OllamaAdapter,
  ThinkingTagParser,
  inferModelCapabilities,
  normalizeOllamaBaseUrl,
  type InferredModelCapabilities,
  type OllamaAdapterDependencies,
  type OllamaChatMessage,
  type OllamaChatRequest,
  type OllamaChatStreamChunk,
  type OllamaModelCatalogEntry,
  type OllamaPluginConfig,
  type OllamaPsResponse,
  type OllamaRunningModel,
  type OllamaShowResponse,
  type OllamaStatusResult,
  type OllamaTagModel,
  type OllamaTagModelDetails,
  type OllamaTagsResponse,
  type OllamaToolCall,
  type OllamaToolDefinition,
  type OllamaVersionResponse,
}
