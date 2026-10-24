/**
 * Type definitions and default model catalog for `@google/dsh-llm-ollama`.
 *
 * @module @google/dsh-llm-ollama/types
 */

import type { ModelModality, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'

/** Catalog metadata for a known or user-configured Ollama model. */
export interface OllamaModelCatalogEntry {
  id: string
  name: string
  description?: string | undefined
  contextWindow: number
  defaultMaxTokens?: number | undefined
  inputModalities: readonly ModelModality[]
  thinking?: boolean | undefined
  tools?: boolean | undefined
  parameterSize?: string | undefined
  quantizationLevel?: string | undefined
  family?: string | undefined
}

/** Configuration options for the `@google/dsh-llm-ollama` Cordis plugin. */
export interface OllamaPluginConfig {
  /** Provider route identifier registered with `ctx.llm` (default: `'ollama'`). */
  provider?: string | undefined
  /** Human-readable provider display name (default: `'Ollama (Local)'`). */
  displayName?: string | undefined
  /** Base URL for the Ollama daemon (falls back to `baseURL`, `OLLAMA_HOST`, or `'http://127.0.0.1:11434'`). */
  baseUrl?: string | undefined
  /** Alias for `baseUrl` matching `LlmConfigurableProvider` conventions. */
  baseURL?: string | undefined
  /** Optional Bearer API key for authenticated remote Ollama proxies (falls back to `OLLAMA_API_KEY`). */
  apiKey?: string | undefined
  /** Environment variable name for the optional API key (default: `'OLLAMA_API_KEY'`). */
  apiKeyEnv?: string | undefined
  /** Default Ollama model tag (default: `'qwen3:32b'`). */
  defaultModel?: string | undefined
  /** Default context window in tokens when not reported by the model (default: `131072`). */
  contextWindow?: number | undefined
  /** Alias for `contextWindow`. */
  defaultContextWindow?: number | undefined
  /** Default max output tokens per request (default: `16384`). */
  defaultMaxTokens?: number | undefined
  /** Alias for `defaultMaxTokens`. */
  maxTokens?: number | undefined
  /** Request timeout in milliseconds for chat streaming (default: `300000`). */
  timeoutMs?: number | undefined
  /** Request timeout in milliseconds for model discovery probes (default: `5000`). */
  discoveryTimeoutMs?: number | undefined
  /** Optional Ollama `keep_alive` duration (e.g. `'5m'`, `'30m'`). */
  keepAlive?: string | undefined
  /** Whether to register the `ollama_models` and `ollama_status` agent tools (default: `true`). */
  enableTools?: boolean | undefined
  /** Alias for `enableTools`. */
  registerTools?: boolean | undefined
  /** Whether to inject the Ollama system prompt section when `systemPrompt` is available (default: `true`). */
  injectSystemPrompt?: boolean | undefined
  /** Whether to probe `POST /api/show` during model resolution/discovery for deep metadata (default: `true`). */
  enrichWithShow?: boolean | undefined
  /** Custom fallback/default models merged with `DEFAULT_OLLAMA_MODELS`. */
  defaultModels?: readonly OllamaModelCatalogEntry[] | undefined
  /** Alias for `defaultModels`. */
  models?: readonly OllamaModelCatalogEntry[] | undefined
  /** Additional static HTTP headers included on every Ollama request. */
  headers?: Record<string, string> | undefined
  /** Optional provider retry policy override. */
  retryPolicy?: RetryPolicyConfig | undefined
  /** Custom `fetch` implementation for testing. */
  fetch?: typeof globalThis.fetch | undefined
}

/** Details block returned by Ollama `/api/tags`, `/api/show`, and `/api/ps`. */
export interface OllamaTagModelDetails {
  parent_model?: string | undefined
  format?: string | undefined
  family?: string | undefined
  families?: string[] | undefined
  parameter_size?: string | undefined
  quantization_level?: string | undefined
}

/** Single model entry returned by `GET /api/tags`. */
export interface OllamaTagModel {
  name?: string | undefined
  model?: string | undefined
  modified_at?: string | undefined
  size?: number | undefined
  digest?: string | undefined
  details?: OllamaTagModelDetails | undefined
}

/** Payload returned by `GET /api/tags`. */
export interface OllamaTagsResponse {
  models?: OllamaTagModel[] | undefined
}

/** Payload returned by `POST /api/show`. */
export interface OllamaShowResponse {
  modelfile?: string | undefined
  parameters?: string | undefined
  template?: string | undefined
  details?: OllamaTagModelDetails | undefined
  model_info?: Record<string, unknown> | undefined
  capabilities?: string[] | undefined
}

/** Single running model entry returned by `GET /api/ps`. */
export interface OllamaRunningModel {
  name?: string | undefined
  model?: string | undefined
  size?: number | undefined
  size_vram?: number | undefined
  digest?: string | undefined
  expires_at?: string | undefined
  details?: OllamaTagModelDetails | undefined
}

/** Payload returned by `GET /api/ps`. */
export interface OllamaPsResponse {
  models?: OllamaRunningModel[] | undefined
}

/** Payload returned by `GET /api/version`. */
export interface OllamaVersionResponse {
  version?: string | undefined
}

/** Tool call object in an Ollama chat message. */
export interface OllamaToolCall {
  id?: string | undefined
  type?: 'function' | undefined
  function: {
    index?: number | undefined
    name: string
    arguments: Record<string, unknown> | string
  }
}

/** Tool definition in an Ollama `/api/chat` request. */
export interface OllamaToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** Wire message in an Ollama `/api/chat` request or response. */
export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  thinking?: string | undefined
  images?: string[] | undefined
  tool_calls?: OllamaToolCall[] | undefined
  tool_name?: string | undefined
  tool_call_id?: string | undefined
}

/** Request body for `POST /api/chat`. */
export interface OllamaChatRequest {
  model: string
  messages: OllamaChatMessage[]
  stream: boolean
  tools?: OllamaToolDefinition[] | undefined
  think?: boolean | undefined
  keep_alive?: string | undefined
  options?: Record<string, unknown> | undefined
}

/** Single NDJSON chunk from `POST /api/chat`. */
export interface OllamaChatStreamChunk {
  model?: string | undefined
  created_at?: string | undefined
  message?: {
    role?: string | undefined
    content?: string | undefined
    thinking?: string | undefined
    tool_calls?: OllamaToolCall[] | undefined
  } | undefined
  done?: boolean | undefined
  done_reason?: string | undefined
  total_duration?: number | undefined
  load_duration?: number | undefined
  prompt_eval_count?: number | undefined
  prompt_eval_duration?: number | undefined
  eval_count?: number | undefined
  eval_duration?: number | undefined
  error?: string | undefined
}

/**
 * Built-in default Ollama model catalog.
 * Advertised when configured or when the local Ollama daemon is offline during `listModels('ollama')`.
 */
export const DEFAULT_OLLAMA_MODELS: readonly OllamaModelCatalogEntry[] = Object.freeze([
  {
    id: 'qwen3:32b',
    name: 'Qwen 3 32B (Local)',
    description: 'Alibaba Qwen 3 32B hybrid thinking & tool-calling model (32B)',
    contextWindow: 131072,
    defaultMaxTokens: 16384,
    inputModalities: ['text'],
    thinking: true,
    tools: true,
    parameterSize: '32B',
    family: 'qwen3',
  },
  {
    id: 'deepseek-r1:32b',
    name: 'DeepSeek R1 32B (Local)',
    description: 'DeepSeek R1 32B chain-of-thought reasoning model (32B)',
    contextWindow: 131072,
    defaultMaxTokens: 16384,
    inputModalities: ['text'],
    thinking: true,
    tools: true,
    parameterSize: '32B',
    family: 'deepseek2',
  },
  {
    id: 'llama3.3:70b',
    name: 'Llama 3.3 70B (Local)',
    description: 'Meta Llama 3.3 70B instruction & tool-calling model (70B)',
    contextWindow: 131072,
    defaultMaxTokens: 16384,
    inputModalities: ['text'],
    thinking: false,
    tools: true,
    parameterSize: '70B',
    family: 'llama',
  },
  {
    id: 'gemma3:27b',
    name: 'Gemma 3 27B Vision (Local)',
    description: 'Google Gemma 3 27B multimodal vision & text model (27B)',
    contextWindow: 131072,
    defaultMaxTokens: 16384,
    inputModalities: ['text', 'image'],
    thinking: false,
    tools: true,
    parameterSize: '27B',
    family: 'gemma3',
  },
  {
    id: 'qwen2.5-coder:32b',
    name: 'Qwen 2.5 Coder 32B (Local)',
    description: 'Alibaba Qwen 2.5 Coder 32B code generation & tool-calling model (32B)',
    contextWindow: 131072,
    defaultMaxTokens: 16384,
    inputModalities: ['text'],
    thinking: false,
    tools: true,
    parameterSize: '32B',
    family: 'qwen2.5',
  },
])
