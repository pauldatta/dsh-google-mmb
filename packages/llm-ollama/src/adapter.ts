/**
 * Ollama LLM adapter (`LlmAdapter`) for DeepSeek Harness (`0.2.1-rc.3`).
 *
 * Implements:
 * - Base URL resolution & `OLLAMA_HOST` normalization (`http://127.0.0.1:11434` default)
 * - Zero-auth local access by default + optional `OLLAMA_API_KEY` Bearer token
 * - Mandatory `attributionHeaders()` on every outbound HTTP request
 * - Dynamic model discovery via `GET /api/tags` + `POST /api/show` with `GET /v1/models` fallback
 * - NDJSON `POST /api/chat` streaming with native `message.thinking`, inline `<think>...</think>`
 *   tag extraction across chunk boundaries, tool calling, and multimodal vision inputs
 * - Actionable `LlmError` (`TRANSPORT`) diagnostics when the local Ollama daemon is unreachable
 *
 * @module @google/dsh-llm-ollama/adapter
 */

import {
  LlmAdapter,
  LlmError,
  ReasoningEffortId,
  ToolCallId,
  assertUsableApiKey,
  attributionHeaders,
  isContextWindowExceededError,
  resolveRetryPolicy,
  type ContentBlock,
  type FinishReason,
  type GenerateOptions,
  type LlmDiscoveredModel,
  type LlmModelDiscoveryRequest,
  type LlmModelInfo,
  type LlmModelReasoningInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type ModelModality,
  type PreparedAdapterCall,
  type RequestMessage,
  type ResolvedRetryPolicy,
  type StreamChunk,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import {
  DEFAULT_OLLAMA_MODELS,
  type OllamaChatMessage,
  type OllamaChatRequest,
  type OllamaChatStreamChunk,
  type OllamaModelCatalogEntry,
  type OllamaPluginConfig,
  type OllamaPsResponse,
  type OllamaShowResponse,
  type OllamaTagModel,
  type OllamaTagsResponse,
  type OllamaToolDefinition,
  type OllamaVersionResponse,
} from './types.ts'

const PACKAGE_NAME = '@google/dsh-llm-ollama'
const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'
const DEFAULT_CONTEXT_WINDOW = 131072
const DEFAULT_MAX_TOKENS = 16384
const OPEN_THINK_TAG = '<think>'
const CLOSE_THINK_TAG = '</think>'

const VISION_MODEL_PATTERN =
  /(?:gemma3|llava|bakllava|moondream|minicpm-v|qwen2\.5-?vl|qwen3-?vl|llama3\.2-vision|pixtral|mistral-small3\.1|granite3\.2-vision|-vl\b)/i

const THINKING_MODEL_PATTERN =
  /(?:deepseek-r1|qwen3|qwq|marco-o1|openthinker|cogito|nemotron-reasoning|\br1\b|thinking|reason)/i

const TOOL_MODEL_PATTERN =
  /(?:qwen|llama3|gemma3|mistral|mixtral|command-r|firefunction|hermes|nemotron|deepseek|granite)/i

/**
 * Normalize an Ollama base URL or `OLLAMA_HOST` value into a canonical origin/base URL.
 *
 * Handles:
 * - Undefined or empty strings -> `process.env.OLLAMA_HOST` or `'http://127.0.0.1:11434'`
 * - Port-only strings (`:11434`) -> `'http://127.0.0.1:11434'`
 * - Bare `host:port` strings (`127.0.0.1:11434`, `0.0.0.0:11434`) -> `'http://127.0.0.1:11434'`
 * - Wildcard bind addresses (`0.0.0.0`) -> `'127.0.0.1'`
 * - Trailing slashes and `/api` or `/v1` path suffixes
 */
export function normalizeOllamaBaseUrl(raw?: string): string {
  const candidate = (raw ?? process.env.OLLAMA_HOST ?? '').trim()
  if (!candidate) return DEFAULT_BASE_URL

  let normalized = candidate
  if (normalized.startsWith(':')) {
    normalized = `http://127.0.0.1${normalized}`
  } else if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`
  }

  normalized = normalized.replace(/^(https?:\/\/)0\.0\.0\.0(?=:|$|\/)/i, '$1127.0.0.1')
  normalized = normalized.replace(/\/+$/, '')

  // Strip trailing /api or /v1 suffixes so endpoint joining never produces /api/api/* or /v1/api/*
  if (/\/(?:api|v1)$/i.test(normalized)) {
    normalized = normalized.replace(/\/(?:api|v1)$/i, '').replace(/\/+$/, '')
  }

  return normalized || DEFAULT_BASE_URL
}

/**
 * Find the length of the longest suffix of `text` that is a strict prefix of `tag`.
 */
function partialTagSuffixLength(text: string, tag: string): number {
  const maxLen = Math.min(text.length, tag.length - 1)
  for (let len = maxLen; len >= 1; len--) {
    if (text.endsWith(tag.slice(0, len))) {
      return len
    }
  }
  return 0
}

/**
 * Streaming state machine that extracts inline `<think>...</think>` blocks from
 * `message.content` across arbitrary NDJSON chunk boundaries.
 */
export class ThinkingTagParser {
  private mode: 'init' | 'thinking' | 'text' = 'init'
  private pending = ''

  push(chunk: string): Array<{ type: 'reasoning' | 'text'; text: string }> {
    if (!chunk) return []
    this.pending += chunk
    const segments: Array<{ type: 'reasoning' | 'text'; text: string }> = []

    const pushSegment = (type: 'reasoning' | 'text', text: string): void => {
      if (!text) return
      const last = segments[segments.length - 1]
      if (last && last.type === type) {
        last.text += text
      } else {
        segments.push({ type, text })
      }
    }

    while (this.pending.length > 0) {
      if (this.mode === 'init' || this.mode === 'text') {
        const openIdx = this.pending.indexOf(OPEN_THINK_TAG)
        if (openIdx !== -1) {
          const before = this.pending.slice(0, openIdx)
          if (before.length > 0 && !(this.mode === 'init' && before.trim().length === 0)) {
            pushSegment('text', before)
          }
          this.pending = this.pending.slice(openIdx + OPEN_THINK_TAG.length)
          this.mode = 'thinking'
          continue
        }

        // If we are at the start of the stream and only have whitespace + partial `<think>`, wait for more chunks
        const trimmedLeading = this.mode === 'init' ? this.pending.trimStart() : this.pending
        if (this.mode === 'init' && trimmedLeading.length === 0) {
          break
        }
        if (
          this.mode === 'init'
          && trimmedLeading.length < OPEN_THINK_TAG.length
          && OPEN_THINK_TAG.startsWith(trimmedLeading)
        ) {
          break
        }

        const holdLen = partialTagSuffixLength(this.pending, OPEN_THINK_TAG)
        const safeText = this.pending.slice(0, this.pending.length - holdLen)
        if (safeText.length > 0) {
          pushSegment('text', safeText)
          this.mode = 'text'
        }
        this.pending = this.pending.slice(this.pending.length - holdLen)
        break
      }

      // mode === 'thinking'
      const closeIdx = this.pending.indexOf(CLOSE_THINK_TAG)
      if (closeIdx !== -1) {
        const thought = this.pending.slice(0, closeIdx)
        if (thought.length > 0) {
          pushSegment('reasoning', thought)
        }
        this.pending = this.pending.slice(closeIdx + CLOSE_THINK_TAG.length)
        this.mode = 'text'
        continue
      }

      const holdLen = partialTagSuffixLength(this.pending, CLOSE_THINK_TAG)
      const safeThought = this.pending.slice(0, this.pending.length - holdLen)
      if (safeThought.length > 0) {
        pushSegment('reasoning', safeThought)
      }
      this.pending = this.pending.slice(this.pending.length - holdLen)
      break
    }

    return segments
  }

  flush(): Array<{ type: 'reasoning' | 'text'; text: string }> {
    if (this.pending.length === 0) return []
    const remaining = this.pending
    this.pending = ''
    if (this.mode === 'thinking') {
      return [{ type: 'reasoning', text: remaining }]
    }
    return [{ type: 'text', text: remaining }]
  }
}

export interface InferredModelCapabilities {
  id: string
  name: string
  description: string
  contextWindow: number
  defaultMaxTokens: number
  inputModalities: readonly ModelModality[]
  thinking: boolean
  tools: boolean
  parameterSize?: string | undefined
  quantizationLevel?: string | undefined
  family?: string | undefined
  reasoning?: LlmModelReasoningInfo | undefined
}

const STANDARD_REASONING_INFO: LlmModelReasoningInfo = Object.freeze({
  efforts: Object.freeze([
    Object.freeze({ id: ReasoningEffortId('low'), name: 'Low', description: 'Concise thinking' }),
    Object.freeze({ id: ReasoningEffortId('medium'), name: 'Medium', description: 'Balanced thinking' }),
    Object.freeze({ id: ReasoningEffortId('high'), name: 'High', description: 'Deep chain-of-thought reasoning' }),
  ]),
  defaultEffort: ReasoningEffortId('high'),
})

function extractContextLengthFromShow(showInfo?: OllamaShowResponse): number | undefined {
  if (!showInfo) return undefined
  if (showInfo.model_info && typeof showInfo.model_info === 'object') {
    for (const [key, value] of Object.entries(showInfo.model_info)) {
      if (
        (key === 'context_length' || key.endsWith('.context_length'))
        && typeof value === 'number'
        && Number.isInteger(value)
        && value > 0
      ) {
        return value
      }
    }
  }
  if (typeof showInfo.parameters === 'string') {
    const match = /\bnum_ctx\s+(\d+)\b/.exec(showInfo.parameters)
    if (match?.[1]) {
      const parsed = Number.parseInt(match[1], 10)
      if (Number.isInteger(parsed) && parsed > 0) return parsed
    }
  }
  return undefined
}

/**
 * Infer and enrich model capabilities from catalog metadata, `/api/tags` details, and `/api/show` info.
 */
export function inferModelCapabilities(
  modelId: string,
  options?: {
    tagModel?: OllamaTagModel | undefined
    showInfo?: OllamaShowResponse | undefined
    catalog?: readonly OllamaModelCatalogEntry[] | undefined
    defaultContextWindow?: number | undefined
    defaultMaxTokens?: number | undefined
  },
): InferredModelCapabilities {
  const catalog = options?.catalog ?? DEFAULT_OLLAMA_MODELS
  const catalogMatch = catalog.find(entry => entry.id === modelId)
  const tagDetails = options?.tagModel?.details
  const showDetails = options?.showInfo?.details
  const capabilities = options?.showInfo?.capabilities ?? []

  const family =
    tagDetails?.family
    ?? showDetails?.family
    ?? catalogMatch?.family
    ?? modelId.split(':')[0]?.split('/')[0]

  const parameterSize =
    tagDetails?.parameter_size
    ?? showDetails?.parameter_size
    ?? catalogMatch?.parameterSize

  const quantizationLevel =
    tagDetails?.quantization_level
    ?? showDetails?.quantization_level
    ?? catalogMatch?.quantizationLevel

  const contextWindow =
    extractContextLengthFromShow(options?.showInfo)
    ?? catalogMatch?.contextWindow
    ?? options?.defaultContextWindow
    ?? DEFAULT_CONTEXT_WINDOW

  const defaultMaxTokens =
    catalogMatch?.defaultMaxTokens
    ?? options?.defaultMaxTokens
    ?? DEFAULT_MAX_TOKENS

  const hasVision =
    capabilities.includes('vision')
    || (catalogMatch?.inputModalities.includes('image') ?? false)
    || VISION_MODEL_PATTERN.test(modelId)
    || (family !== undefined && VISION_MODEL_PATTERN.test(family))
    || (tagDetails?.families?.some(f => VISION_MODEL_PATTERN.test(f)) ?? false)

  const inputModalities: readonly ModelModality[] = hasVision ? ['text', 'image'] : ['text']

  const hasThinking =
    capabilities.includes('thinking')
    || (catalogMatch?.thinking ?? false)
    || THINKING_MODEL_PATTERN.test(modelId)
    || (family !== undefined && THINKING_MODEL_PATTERN.test(family))

  const hasTools =
    capabilities.includes('tools')
    || (catalogMatch?.tools ?? false)
    || TOOL_MODEL_PATTERN.test(modelId)
    || (family !== undefined && TOOL_MODEL_PATTERN.test(family))

  const metaParts: string[] = []
  if (family) metaParts.push(family)
  if (parameterSize) metaParts.push(parameterSize)
  if (quantizationLevel) metaParts.push(quantizationLevel)
  if (hasVision) metaParts.push('vision')
  if (hasThinking) metaParts.push('thinking')
  if (hasTools) metaParts.push('tools')

  const baseName = catalogMatch?.name ?? modelId
  const name =
    catalogMatch === undefined && (parameterSize || quantizationLevel)
      ? `${baseName} (${[parameterSize, quantizationLevel].filter(Boolean).join(', ')})`
      : baseName

  const description =
    catalogMatch?.description && !parameterSize && !quantizationLevel
      ? catalogMatch.description
      : metaParts.length > 0
        ? `Ollama model ${modelId} [${metaParts.join(', ')}] (context: ${contextWindow} tokens)`
        : `Ollama local model ${modelId}`

  return {
    id: modelId,
    name,
    description,
    contextWindow,
    defaultMaxTokens,
    inputModalities,
    thinking: hasThinking,
    tools: hasTools,
    ...(parameterSize !== undefined ? { parameterSize } : {}),
    ...(quantizationLevel !== undefined ? { quantizationLevel } : {}),
    ...(family !== undefined ? { family } : {}),
    ...(hasThinking ? { reasoning: STANDARD_REASONING_INFO } : {}),
  }
}

export interface OllamaAdapterDependencies {
  config: OllamaPluginConfig
  resolveAttachments?: (() => AttachmentStore | undefined) | undefined
  resolveSettingsBaseUrl?: (() => string | undefined) | undefined
  resolveStoredApiKey?: (() => Promise<string | undefined> | string | undefined) | undefined
}

export interface OllamaStatusResult {
  online: boolean
  baseUrl: string
  version?: string | undefined
  installedModelsCount: number
  installedModels: string[]
  runningModels: Array<{
    name: string
    sizeVramBytes?: number | undefined
    expiresAt?: string | undefined
  }>
  message: string
}

export class OllamaAdapter extends LlmAdapter {
  private readonly config: OllamaPluginConfig
  private readonly resolveAttachments?: (() => AttachmentStore | undefined) | undefined
  private readonly resolveSettingsBaseUrl?: (() => string | undefined) | undefined
  private readonly resolveStoredApiKey?: (() => Promise<string | undefined> | string | undefined) | undefined
  private readonly retryPolicy: ResolvedRetryPolicy | undefined
  private readonly catalog: readonly OllamaModelCatalogEntry[]
  private readonly discoveredCache = new Map<string, InferredModelCapabilities>()

  constructor(deps: OllamaAdapterDependencies) {
    super()
    this.config = deps.config
    this.resolveAttachments = deps.resolveAttachments
    this.resolveSettingsBaseUrl = deps.resolveSettingsBaseUrl
    this.resolveStoredApiKey = deps.resolveStoredApiKey
    this.retryPolicy = deps.config.retryPolicy
      ? resolveRetryPolicy(deps.config.retryPolicy, 'llm-ollama.retryPolicy')
      : undefined

    const customModels = deps.config.defaultModels ?? deps.config.models ?? []
    const mergedMap = new Map<string, OllamaModelCatalogEntry>()
    for (const model of customModels) {
      mergedMap.set(model.id, model)
    }
    for (const model of DEFAULT_OLLAMA_MODELS) {
      if (!mergedMap.has(model.id)) {
        mergedMap.set(model.id, model)
      }
    }
    this.catalog = Object.freeze([...mergedMap.values()])
  }

  get providerId(): string {
    return this.config.provider ?? 'ollama'
  }

  get displayName(): string {
    return this.config.displayName ?? 'Ollama (Local)'
  }

  get baseUrl(): string {
    const raw =
      this.config.baseUrl
      ?? this.config.baseURL
      ?? this.resolveSettingsBaseUrl?.()
      ?? process.env.OLLAMA_HOST
    return normalizeOllamaBaseUrl(raw)
  }

  private get fetchFn(): typeof globalThis.fetch {
    return this.config.fetch ?? globalThis.fetch
  }

  private get defaultContextWindow(): number {
    return this.config.contextWindow ?? this.config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW
  }

  private get defaultMaxTokens(): number {
    return this.config.defaultMaxTokens ?? this.config.maxTokens ?? DEFAULT_MAX_TOKENS
  }

  private async buildHeaders(
    apiKeyOverride?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      ...attributionHeaders(),
      ...(this.config.headers ?? {}),
      ...(extraHeaders ?? {}),
    }

    const apiKeyEnvName = this.config.apiKeyEnv ?? 'OLLAMA_API_KEY'
    let rawKey: string | undefined
    let keySourceRef = apiKeyEnvName

    if (apiKeyOverride !== undefined) {
      rawKey = apiKeyOverride
      keySourceRef = 'apiKey'
    } else if (this.config.apiKey !== undefined) {
      rawKey = this.config.apiKey
      keySourceRef = 'config.apiKey'
    } else {
      const stored = await this.resolveStoredApiKey?.()
      if (stored !== undefined && stored.length > 0) {
        rawKey = stored
        keySourceRef = 'credentials.ollama'
      } else {
        const envVal = process.env[apiKeyEnvName]
        if (envVal !== undefined && envVal.trim().length > 0) {
          rawKey = envVal
          keySourceRef = apiKeyEnvName
        }
      }
    }

    // Zero-auth default: when no API key is configured, omit Authorization header
    if (rawKey !== undefined && rawKey.length > 0) {
      const usableKey = assertUsableApiKey(rawKey, PACKAGE_NAME, keySourceRef)
      headers['Authorization'] = `Bearer ${usableKey}`
    }

    return headers
  }

  private createUnreachableError(targetBaseUrl: string, model?: string, cause?: unknown): LlmError {
    const pullHint = model ? ` and that model "${model}" is pulled ("ollama pull ${model}")` : ' (e.g. "ollama pull qwen3:32b")'
    return new LlmError(
      `Failed to connect to local Ollama daemon at ${targetBaseUrl}. `
      + `Ensure Ollama is running ("ollama serve")${pullHint}, `
      + `or set OLLAMA_HOST to a reachable Ollama server URL.`,
      'TRANSPORT',
      cause !== undefined ? { cause } : undefined,
    )
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return {
      id: provider,
      name: this.displayName,
    }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined {
    return this.retryPolicy
  }

  private async fetchShowInfo(
    targetBaseUrl: string,
    modelId: string,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<OllamaShowResponse | undefined> {
    if (this.config.enrichWithShow === false) return undefined
    try {
      const response = await this.fetchFn(`${targetBaseUrl}/api/show`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: modelId }),
        ...(signal !== undefined ? { signal } : {}),
      })
      if (!response.ok) return undefined
      const data = (await response.json()) as OllamaShowResponse
      return data
    } catch {
      return undefined
    }
  }

  /**
   * Interrogate `GET {baseUrl}/api/tags` (with optional `POST /api/show` enrichment)
   * and automatic fallback to `GET {baseUrl}/v1/models` on HTTP 404.
   */
  async discoverDetailedModels(
    request?: LlmModelDiscoveryRequest,
    signal?: AbortSignal,
  ): Promise<InferredModelCapabilities[]> {
    const targetBaseUrl = normalizeOllamaBaseUrl(request?.baseURL ?? this.baseUrl)
    const headers = await this.buildHeaders(request?.apiKey)

    let response: Response
    try {
      response = await this.fetchFn(`${targetBaseUrl}/api/tags`, {
        method: 'GET',
        headers,
        ...(signal !== undefined ? { signal } : {}),
      })
    } catch (error) {
      if (signal?.aborted) {
        throw new LlmError('Ollama model discovery aborted', 'ABORTED', { cause: error })
      }
      throw this.createUnreachableError(targetBaseUrl, undefined, error)
    }

    if (response.status === 404) {
      // Automatic fallback to OpenAI-compatible GET /v1/models
      let v1Response: Response
      try {
        v1Response = await this.fetchFn(`${targetBaseUrl}/v1/models`, {
          method: 'GET',
          headers,
          ...(signal !== undefined ? { signal } : {}),
        })
      } catch (error) {
        if (signal?.aborted) {
          throw new LlmError('Ollama model discovery aborted', 'ABORTED', { cause: error })
        }
        throw this.createUnreachableError(targetBaseUrl, undefined, error)
      }

      if (!v1Response.ok) {
        throw new LlmError(
          `Ollama model discovery failed at ${targetBaseUrl}/v1/models with HTTP ${v1Response.status}`,
          v1Response.status === 401 || v1Response.status === 403 ? 'INVALID_CREDENTIAL' : 'DISCOVERY_FAILED',
          { status: v1Response.status },
        )
      }

      const v1Data = (await v1Response.json()) as {
        data?: Array<{ id?: string; name?: string; context_window?: number; max_tokens?: number }>
        models?: Array<{ id?: string; name?: string }>
      }
      const rawEntries = Array.isArray(v1Data?.data)
        ? v1Data.data
        : Array.isArray(v1Data?.models)
          ? v1Data.models
          : []

      const results: InferredModelCapabilities[] = []
      const seen = new Set<string>()
      for (const entry of rawEntries) {
        const id = (entry?.id ?? entry?.name ?? '').trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        const inferred = inferModelCapabilities(id, {
          catalog: this.catalog,
          defaultContextWindow: this.defaultContextWindow,
          defaultMaxTokens: this.defaultMaxTokens,
        })
        this.discoveredCache.set(id, inferred)
        results.push(inferred)
      }
      return results
    }

    if (!response.ok) {
      throw new LlmError(
        `Ollama model discovery failed at ${targetBaseUrl}/api/tags with HTTP ${response.status}`,
        response.status === 401 || response.status === 403 ? 'INVALID_CREDENTIAL' : 'DISCOVERY_FAILED',
        { status: response.status },
      )
    }

    const tagsPayload = (await response.json()) as OllamaTagsResponse
    const rawModels = Array.isArray(tagsPayload?.models) ? tagsPayload.models : []
    const results: InferredModelCapabilities[] = []
    const seen = new Set<string>()

    for (const tagModel of rawModels) {
      const id = (tagModel.name ?? tagModel.model ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)

      const showInfo = await this.fetchShowInfo(targetBaseUrl, id, headers, signal)
      const inferred = inferModelCapabilities(id, {
        tagModel,
        showInfo,
        catalog: this.catalog,
        defaultContextWindow: this.defaultContextWindow,
        defaultMaxTokens: this.defaultMaxTokens,
      })
      this.discoveredCache.set(id, inferred)
      results.push(inferred)
    }

    return results
  }

  /**
   * Model discovery handler for `ctx.llm.registerModelDiscovery`.
   */
  async discoverModels(
    request: LlmModelDiscoveryRequest = {},
    signal?: AbortSignal,
  ): Promise<readonly LlmDiscoveredModel[]> {
    const detailed = await this.discoverDetailedModels(request, signal)
    return detailed.map(model => ({
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxTokens: model.defaultMaxTokens,
      inputModalities: model.inputModalities,
    }))
  }

  /**
   * List models for `ctx.llm.listModels(provider)`.
   * Queries live Ollama discovery when reachable; falls back to the 5 built-in default catalog models when offline.
   */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    try {
      const discovered = await this.discoverDetailedModels({ provider })
      if (discovered.length > 0) {
        return discovered.map(model => ({
          provider,
          id: model.id,
          name: model.name,
          description: model.description,
          inputModalities: model.inputModalities,
        }))
      }
    } catch {
      // Daemon offline during catalog listing: fall back gracefully to the configured default catalog
    }

    return this.catalog.map(entry => ({
      provider,
      id: entry.id,
      name: entry.name,
      ...(entry.description !== undefined ? { description: entry.description } : {}),
      inputModalities: entry.inputModalities,
    }))
  }

  /**
   * Resolve exact model capabilities for `provider` and `model`.
   */
  override async resolveModel(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    if (signal?.aborted) {
      throw new LlmError('Model resolution aborted', 'ABORTED')
    }

    const headers = await this.buildHeaders()
    const showInfo = await this.fetchShowInfo(this.baseUrl, model, headers, signal)
    const cached = this.discoveredCache.get(model)

    const inferred =
      showInfo === undefined && cached !== undefined
        ? cached
        : inferModelCapabilities(model, {
            showInfo,
            catalog: this.catalog,
            defaultContextWindow: this.defaultContextWindow,
            defaultMaxTokens: this.defaultMaxTokens,
          })

    this.discoveredCache.set(model, inferred)

    return {
      provider,
      id: model,
      name: inferred.name,
      description: inferred.description,
      inputModalities: inferred.inputModalities,
      context: {
        contextWindow: inferred.contextWindow,
      },
      defaultMaxTokens: inferred.defaultMaxTokens,
      ...(inferred.reasoning !== undefined ? { reasoning: inferred.reasoning } : {}),
    }
  }

  /**
   * Bind exact model metadata and stream execution to one adapter generation (`0.2.1-rc.3` contract).
   */
  override async prepareCall(
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<PreparedAdapterCall> {
    const resolvedModel = await this.resolveModel(provider, model, signal)
    return {
      model: resolvedModel,
      stream: options => this.stream(options),
    }
  }

  private async extractImageBase64(
    block: Extract<ContentBlock, { type: 'image' }>,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (block.offloaded) return undefined
    const store = this.resolveAttachments?.()
    if (store && block.attachment) {
      const stored = await store.readImage(block.attachment, signal)
      const rawData = (stored as { data?: Uint8Array | string } | Uint8Array | string)
      if (typeof rawData === 'string') return rawData
      if (rawData instanceof Uint8Array) return Buffer.from(rawData).toString('base64')
      if (rawData && typeof rawData === 'object' && 'data' in rawData) {
        const inner = rawData.data
        if (typeof inner === 'string') return inner
        if (inner instanceof Uint8Array) return Buffer.from(inner).toString('base64')
      }
    }

    // Inline fallback for unit tests that supply base64 or bytes directly on attachment/block
    const candidateAttachment = block.attachment as unknown as {
      data?: Uint8Array | string
      base64?: string
    } | undefined
    if (typeof candidateAttachment?.base64 === 'string') return candidateAttachment.base64
    if (typeof candidateAttachment?.data === 'string') return candidateAttachment.data
    if (candidateAttachment?.data instanceof Uint8Array) {
      return Buffer.from(candidateAttachment.data).toString('base64')
    }

    const candidateBlock = block as unknown as { data?: Uint8Array | string; base64?: string }
    if (typeof candidateBlock.base64 === 'string') return candidateBlock.base64
    if (typeof candidateBlock.data === 'string') return candidateBlock.data
    if (candidateBlock.data instanceof Uint8Array) {
      return Buffer.from(candidateBlock.data).toString('base64')
    }

    return undefined
  }

  private async convertMessages(
    options: GenerateOptions,
  ): Promise<OllamaChatMessage[]> {
    const ollamaMessages: OllamaChatMessage[] = []

    // Map top-level system prompt if provided
    const rawSystem = options.system as unknown
    if (typeof rawSystem === 'string' && rawSystem.trim().length > 0) {
      ollamaMessages.push({
        role: 'system',
        content: rawSystem,
      })
    } else if (Array.isArray(rawSystem)) {
      const joined = rawSystem
        .map((seg: unknown) => (typeof seg === 'string' ? seg : (seg as { text?: string })?.text ?? ''))
        .filter(Boolean)
        .join('\n\n')
      if (joined.length > 0) {
        ollamaMessages.push({
          role: 'system',
          content: joined,
        })
      }
    }

    // Build toolCallId -> toolName correlation map from assistant ToolCallBlocks
    const toolCallNames = new Map<string, string>()
    for (const message of options.messages) {
      if (message.role === 'assistant') {
        for (const block of message.content) {
          if (block.type === 'tool-call') {
            toolCallNames.set(String(block.id), block.name)
          }
        }
      }
    }

    for (const message of options.messages as readonly RequestMessage[]) {
      if (message.role === 'system' || message.role === 'developer') {
        const text = message.content
          .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
          .map(b => b.text)
          .filter(Boolean)
          .join('\n\n')
        if (text.length > 0) {
          ollamaMessages.push({
            role: 'system',
            content: text,
          })
        }
        continue
      }

      if (message.role === 'user') {
        const textParts: string[] = []
        const images: string[] = []

        for (const block of message.content) {
          if (block.type === 'text') {
            if (block.text) textParts.push(block.text)
          } else if (block.type === 'image') {
            const base64 = await this.extractImageBase64(block, options.signal)
            if (base64) images.push(base64)
          }
        }

        ollamaMessages.push({
          role: 'user',
          content: textParts.join('\n'),
          ...(images.length > 0 ? { images } : {}),
        })
        continue
      }

      if (message.role === 'assistant') {
        const textParts: string[] = []
        const thinkingParts: string[] = []
        const toolCalls: NonNullable<OllamaChatMessage['tool_calls']> = []

        for (const block of message.content) {
          if (block.type === 'text') {
            if (block.text) textParts.push(block.text)
          } else if (block.type === 'reasoning') {
            if (block.text) thinkingParts.push(block.text)
          } else if (block.type === 'tool-call') {
            let parsedArgs: Record<string, unknown> = {}
            try {
              const candidate = JSON.parse(block.arguments) as unknown
              if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
                parsedArgs = candidate as Record<string, unknown>
              } else {
                parsedArgs = { value: candidate }
              }
            } catch {
              parsedArgs = { raw: block.arguments }
            }
            toolCalls.push({
              id: String(block.id),
              type: 'function',
              function: {
                name: block.name,
                arguments: parsedArgs,
              },
            })
          }
        }

        ollamaMessages.push({
          role: 'assistant',
          content: textParts.join('\n'),
          ...(thinkingParts.length > 0 ? { thinking: thinkingParts.join('\n') } : {}),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        })
        continue
      }

      if (message.role === 'tool') {
        const contentText = message.content
          .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
          .map(b => b.text)
          .join('\n')
        const callId = String(message.toolCallId)
        const toolName = toolCallNames.get(callId)
        ollamaMessages.push({
          role: 'tool',
          content: contentText,
          ...(toolName !== undefined ? { tool_name: toolName } : {}),
          tool_call_id: callId,
        })
      }
    }

    return ollamaMessages
  }

  private convertTools(tools?: readonly ToolSchema[]): OllamaToolDefinition[] | undefined {
    if (!tools || tools.length === 0) return undefined
    return tools.map((tool) => {
      const fallbackSchema = (tool as unknown as { inputSchema?: Record<string, unknown> }).inputSchema
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters ?? fallbackSchema ?? { type: 'object', properties: {} },
        },
      }
    })
  }

  /**
   * Stream chat completion chunks from `POST {baseUrl}/api/chat` in NDJSON format.
   */
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.signal?.aborted) {
      throw new LlmError('LLM request aborted', 'ABORTED')
    }

    const targetBaseUrl = this.baseUrl
    const headers = await this.buildHeaders(undefined, {
      'Content-Type': 'application/json',
      'Accept': 'application/x-ndjson, application/json',
    })

    const messages = await this.convertMessages(options)
    const tools = this.convertTools(options.tools)

    const modelOptions: Record<string, unknown> = {}
    if (options.temperature !== undefined) {
      modelOptions['temperature'] = options.temperature
    }
    if (options.maxTokens !== undefined) {
      modelOptions['num_predict'] = options.maxTokens
    }
    const stopSeqs =
      options.stop
      ?? (options as unknown as { stopSequences?: readonly string[] }).stopSequences
    if (stopSeqs && stopSeqs.length > 0) {
      modelOptions['stop'] = [...stopSeqs]
    }
    if (this.config.contextWindow !== undefined || this.config.defaultContextWindow !== undefined) {
      modelOptions['num_ctx'] = this.defaultContextWindow
    }

    const shouldThink =
      options.reasoningEffort !== undefined
      || THINKING_MODEL_PATTERN.test(options.model)

    const requestBody: OllamaChatRequest = {
      model: options.model,
      messages,
      stream: true,
      ...(tools !== undefined ? { tools } : {}),
      ...(shouldThink ? { think: true } : {}),
      ...(this.config.keepAlive !== undefined ? { keep_alive: this.config.keepAlive } : {}),
      ...(Object.keys(modelOptions).length > 0 ? { options: modelOptions } : {}),
    }

    let response: Response
    try {
      response = await this.fetchFn(`${targetBaseUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      })
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new LlmError('LLM request aborted', 'ABORTED', { cause: error })
      }
      throw this.createUnreachableError(targetBaseUrl, options.model, error)
    }

    if (!response.ok) {
      let errorDetail = ''
      try {
        const rawText = await response.text()
        try {
          const parsed = JSON.parse(rawText) as { error?: string; message?: string }
          errorDetail = parsed.error ?? parsed.message ?? rawText
        } catch {
          errorDetail = rawText
        }
      } catch {
        errorDetail = response.statusText
      }

      if (response.status === 401 || response.status === 403) {
        throw new LlmError(
          `Ollama authentication failed at ${targetBaseUrl} (HTTP ${response.status}): ${errorDetail || 'unauthorized'}. Check OLLAMA_API_KEY.`,
          'INVALID_CREDENTIAL',
          { status: response.status },
        )
      }
      if (response.status === 429) {
        throw new LlmError(
          `Ollama rate limit exceeded at ${targetBaseUrl} (HTTP 429): ${errorDetail}`,
          'RATE_LIMIT',
          { status: 429 },
        )
      }
      if (isContextWindowExceededError(errorDetail)) {
        throw new LlmError(
          `Ollama context window exceeded for model "${options.model}": ${errorDetail}`,
          'CONTEXT_WINDOW_EXCEEDED',
          { status: response.status },
        )
      }
      if (response.status === 404) {
        throw new LlmError(
          `Ollama model "${options.model}" not found at ${targetBaseUrl}${errorDetail ? ` (${errorDetail})` : ''}. `
          + `Run "ollama pull ${options.model}" to download the model or check OLLAMA_HOST.`,
          'PROVIDER_HTTP',
          { status: 404 },
        )
      }
      if (response.status >= 500) {
        throw new LlmError(
          `Ollama server error at ${targetBaseUrl} (HTTP ${response.status}): ${errorDetail}`,
          'SERVER',
          { status: response.status },
        )
      }
      throw new LlmError(
        `Ollama request failed at ${targetBaseUrl} (HTTP ${response.status}): ${errorDetail}`,
        'PROVIDER_HTTP',
        { status: response.status },
      )
    }

    if (!response.body) {
      throw new LlmError(`Ollama response from ${targetBaseUrl}/api/chat contained no body`, 'EMPTY_RESPONSE')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const thinkingParser = new ThinkingTagParser()

    let lineBuffer = ''
    let nextBlockIndex = 0
    let activeBlock: { index: number; type: 'reasoning' | 'text'; text: string } | null = null
    let toolCallCount = 0
    let inputTokens = 0
    let outputTokens = 0
    let doneReceived = false
    let doneReason: string | undefined

    const openOrAppendBlock = (type: 'reasoning' | 'text', deltaText: string): StreamChunk[] => {
      if (!deltaText) return []
      const chunks: StreamChunk[] = []
      if (activeBlock && activeBlock.type !== type) {
        chunks.push({
          type: 'block-end',
          index: activeBlock.index,
          block: { type: activeBlock.type, text: activeBlock.text },
        })
        activeBlock = null
      }
      if (!activeBlock) {
        const index = nextBlockIndex++
        activeBlock = { index, type, text: '' }
        chunks.push({
          type: 'block-start',
          index,
          blockType: type,
        })
      }
      activeBlock.text += deltaText
      if (type === 'reasoning') {
        chunks.push({
          type: 'reasoning-delta',
          index: activeBlock.index,
          text: deltaText,
        })
      } else {
        chunks.push({
          type: 'text-delta',
          index: activeBlock.index,
          text: deltaText,
        })
      }
      return chunks
    }

    const closeActiveBlock = (): StreamChunk[] => {
      if (!activeBlock) return []
      const closed = activeBlock
      activeBlock = null
      return [
        {
          type: 'block-end',
          index: closed.index,
          block: { type: closed.type, text: closed.text },
        },
      ]
    }

    const processLine = (rawLine: string): StreamChunk[] => {
      const trimmed = rawLine.trim()
      if (!trimmed) return []
      const normalizedLine = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
      if (!normalizedLine || normalizedLine === '[DONE]') return []

      let parsed: OllamaChatStreamChunk
      try {
        parsed = JSON.parse(normalizedLine) as OllamaChatStreamChunk
      } catch (err) {
        throw new LlmError(
          `Malformed NDJSON chunk from Ollama at ${targetBaseUrl}: ${normalizedLine.slice(0, 200)}`,
          'MALFORMED_RESPONSE',
          { cause: err },
        )
      }

      if (typeof parsed.error === 'string' && parsed.error.length > 0) {
        if (isContextWindowExceededError(parsed.error)) {
          throw new LlmError(parsed.error, 'CONTEXT_WINDOW_EXCEEDED')
        }
        const isNotFound = /not found/i.test(parsed.error)
        throw new LlmError(
          `Ollama error: ${parsed.error}${isNotFound ? `. Run "ollama pull ${options.model}" to download it.` : ''}`,
          'PROVIDER_HTTP',
          isNotFound ? { status: 404 } : undefined,
        )
      }

      const out: StreamChunk[] = []

      // 1. Native `message.thinking` field (Ollama 0.6+)
      const nativeThinking = parsed.message?.thinking
      if (typeof nativeThinking === 'string' && nativeThinking.length > 0) {
        out.push(...openOrAppendBlock('reasoning', nativeThinking))
      }

      // 2. `message.content` (supports inline `<think>...</think>` across chunk boundaries)
      const contentDelta = parsed.message?.content
      if (typeof contentDelta === 'string' && contentDelta.length > 0) {
        const segments = thinkingParser.push(contentDelta)
        for (const seg of segments) {
          out.push(...openOrAppendBlock(seg.type, seg.text))
        }
      }

      // 3. `message.tool_calls`
      const toolCalls = parsed.message?.tool_calls
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        for (const seg of thinkingParser.flush()) {
          out.push(...openOrAppendBlock(seg.type, seg.text))
        }
        out.push(...closeActiveBlock())

        for (const tc of toolCalls) {
          const fnName = tc.function?.name
          if (!fnName) continue
          const index = nextBlockIndex++
          const rawId = typeof tc.id === 'string' && tc.id.length > 0 ? tc.id : `ollama_call_${index}`
          const callId = ToolCallId(rawId)
          const rawArgs = tc.function.arguments
          const argsJson =
            typeof rawArgs === 'string'
              ? rawArgs
              : JSON.stringify(rawArgs ?? {})

          toolCallCount++
          out.push({
            type: 'block-start',
            index,
            blockType: 'tool-call',
          })
          out.push({
            type: 'tool-call-delta',
            index,
            id: callId,
            name: fnName,
            argumentsDelta: argsJson,
          })
          out.push({
            type: 'block-end',
            index,
            block: {
              type: 'tool-call',
              id: callId,
              name: fnName,
              arguments: argsJson,
            },
          })
        }
      }

      if (typeof parsed.prompt_eval_count === 'number' && parsed.prompt_eval_count >= 0) {
        inputTokens = parsed.prompt_eval_count
      }
      if (typeof parsed.eval_count === 'number' && parsed.eval_count >= 0) {
        outputTokens = parsed.eval_count
      }

      if (parsed.done === true) {
        doneReceived = true
        doneReason = parsed.done_reason
      }

      return out
    }

    try {
      for (;;) {
        if (options.signal?.aborted) {
          throw new LlmError('LLM request aborted', 'ABORTED')
        }
        const { done, value } = await reader.read()
        if (done) break

        lineBuffer += decoder.decode(value, { stream: true })
        let newlineIdx = lineBuffer.indexOf('\n')
        while (newlineIdx !== -1) {
          const line = lineBuffer.slice(0, newlineIdx)
          lineBuffer = lineBuffer.slice(newlineIdx + 1)
          const emitted = processLine(line)
          for (const chunk of emitted) {
            yield chunk
          }
          newlineIdx = lineBuffer.indexOf('\n')
        }
      }

      lineBuffer += decoder.decode()
      if (lineBuffer.trim().length > 0) {
        for (const line of lineBuffer.split('\n')) {
          const emitted = processLine(line)
          for (const chunk of emitted) {
            yield chunk
          }
        }
      }
    } catch (error) {
      if (error instanceof LlmError) throw error
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new LlmError('LLM request aborted', 'ABORTED', { cause: error })
      }
      throw this.createUnreachableError(targetBaseUrl, options.model, error)
    } finally {
      await reader.cancel().catch(() => {})
    }

    // Flush any remaining buffered content in the `<think>` parser and close any open block
    for (const seg of thinkingParser.flush()) {
      for (const chunk of openOrAppendBlock(seg.type, seg.text)) {
        yield chunk
      }
    }
    for (const chunk of closeActiveBlock()) {
      yield chunk
    }

    yield {
      type: 'usage',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    }

    const finishReason: FinishReason =
      toolCallCount > 0 || doneReason === 'tool_calls'
        ? { kind: 'tool-calls' }
        : doneReason === 'length'
          ? { kind: 'max-tokens' }
          : { kind: 'stop' }

    void doneReceived
    yield {
      type: 'finish',
      reason: finishReason,
    }
  }

  /**
   * Diagnostic status check used by the `ollama_status` runtime tool.
   */
  async getDaemonStatus(signal?: AbortSignal): Promise<OllamaStatusResult> {
    const targetBaseUrl = this.baseUrl
    const headers = await this.buildHeaders()

    try {
      const tagsRes = await this.fetchFn(`${targetBaseUrl}/api/tags`, {
        method: 'GET',
        headers,
        ...(signal !== undefined ? { signal } : {}),
      })

      if (!tagsRes.ok) {
        return {
          online: false,
          baseUrl: targetBaseUrl,
          installedModelsCount: 0,
          installedModels: [],
          runningModels: [],
          message: `Ollama daemon at ${targetBaseUrl} returned HTTP ${tagsRes.status}.`,
        }
      }

      const tagsData = (await tagsRes.json()) as OllamaTagsResponse
      const installedModels = (tagsData.models ?? [])
        .map(m => (m.name ?? m.model ?? '').trim())
        .filter(Boolean)

      let version: string | undefined
      try {
        const verRes = await this.fetchFn(`${targetBaseUrl}/api/version`, {
          method: 'GET',
          headers,
          ...(signal !== undefined ? { signal } : {}),
        })
        if (verRes.ok) {
          const verData = (await verRes.json()) as OllamaVersionResponse
          version = verData.version
        }
      } catch {
        // Optional endpoint
      }

      const runningModels: OllamaStatusResult['runningModels'] = []
      try {
        const psRes = await this.fetchFn(`${targetBaseUrl}/api/ps`, {
          method: 'GET',
          headers,
          ...(signal !== undefined ? { signal } : {}),
        })
        if (psRes.ok) {
          const psData = (await psRes.json()) as OllamaPsResponse
          for (const rm of psData.models ?? []) {
            const rmName = (rm.name ?? rm.model ?? '').trim()
            if (!rmName) continue
            runningModels.push({
              name: rmName,
              ...(rm.size_vram !== undefined ? { sizeVramBytes: rm.size_vram } : {}),
              ...(rm.expires_at !== undefined ? { expiresAt: rm.expires_at } : {}),
            })
          }
        }
      } catch {
        // Optional endpoint
      }

      return {
        online: true,
        baseUrl: targetBaseUrl,
        ...(version !== undefined ? { version } : {}),
        installedModelsCount: installedModels.length,
        installedModels,
        runningModels,
        message: `Ollama daemon is online at ${targetBaseUrl} (${installedModels.length} model(s) installed).`,
      }
    } catch {
      return {
        online: false,
        baseUrl: targetBaseUrl,
        installedModelsCount: 0,
        installedModels: [],
        runningModels: [],
        message:
          `Ollama daemon is unreachable at ${targetBaseUrl}. `
          + `Start it with "ollama serve" and pull a model (e.g. "ollama pull qwen3:32b"), or set OLLAMA_HOST.`,
      }
    }
  }

  /**
   * List models for the `ollama_models` runtime tool.
   */
  async getModelsToolPayload(
    includeFallback = true,
    signal?: AbortSignal,
  ): Promise<{
    online: boolean
    baseUrl: string
    models: Array<{
      id: string
      name: string
      contextWindow: number
      inputModalities: string[]
      thinking: boolean
      tools: boolean
      parameterSize?: string | undefined
      quantizationLevel?: string | undefined
    }>
  }> {
    const targetBaseUrl = this.baseUrl
    try {
      const discovered = await this.discoverDetailedModels(undefined, signal)
      return {
        online: true,
        baseUrl: targetBaseUrl,
        models: discovered.map(m => ({
          id: m.id,
          name: m.name,
          contextWindow: m.contextWindow,
          inputModalities: [...m.inputModalities],
          thinking: m.thinking,
          tools: m.tools,
          ...(m.parameterSize !== undefined ? { parameterSize: m.parameterSize } : {}),
          ...(m.quantizationLevel !== undefined ? { quantizationLevel: m.quantizationLevel } : {}),
        })),
      }
    } catch {
      if (!includeFallback) {
        return {
          online: false,
          baseUrl: targetBaseUrl,
          models: [],
        }
      }
      return {
        online: false,
        baseUrl: targetBaseUrl,
        models: this.catalog.map(m => ({
          id: m.id,
          name: m.name,
          contextWindow: m.contextWindow,
          inputModalities: [...m.inputModalities],
          thinking: Boolean(m.thinking),
          tools: Boolean(m.tools),
          ...(m.parameterSize !== undefined ? { parameterSize: m.parameterSize } : {}),
          ...(m.quantizationLevel !== undefined ? { quantizationLevel: m.quantizationLevel } : {}),
        })),
      }
    }
  }
}
