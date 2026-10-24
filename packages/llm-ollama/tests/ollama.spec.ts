import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, {
  BlockAssembler,
  LlmError,
  MessageId,
  ReasoningEffortId,
  ToolCallId,
  attributionHeaders,
  type GenerateOptions,
  type LlmConfigurableProvider,
  type LlmModelDiscoveryRequest,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolsService, projectToolSchema } from '@deepseek-ai/dsh-tools'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import * as ollamaPlugin from '../src/index.ts'
import {
  Config,
  DEFAULT_OLLAMA_MODELS,
  OllamaAdapter,
  ThinkingTagParser,
  apply,
  inferModelCapabilities,
  inject,
  name,
  normalizeOllamaBaseUrl,
  type OllamaChatRequest,
} from '../src/index.ts'
import * as invariantPlugin from '../src/invariant.ts'

interface RecordedRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  bodyText: string
  bodyJson?: unknown
}

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  recorded: RecordedRequest,
) => void | Promise<void>

async function startMockOllamaServer(handler: RouteHandler): Promise<{
  server: Server
  baseUrl: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}> {
  const requests: RecordedRequest[] = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const bodyText = Buffer.concat(chunks).toString('utf8')
    let bodyJson: unknown
    if (bodyText.trim().length > 0) {
      try {
        bodyJson = JSON.parse(bodyText)
      } catch {
        bodyJson = undefined
      }
    }
    const recorded: RecordedRequest = {
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      headers: req.headers,
      bodyText,
      bodyJson,
    }
    requests.push(recorded)
    await handler(req, res, recorded)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    server,
    baseUrl,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}

async function collectChunks(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('@google/dsh-llm-ollama plugin & OllamaAdapter', () => {
  const originalOllamaHost = process.env.OLLAMA_HOST
  const originalOllamaApiKey = process.env.OLLAMA_API_KEY
  let activeClose: (() => Promise<void>) | undefined

  beforeEach(() => {
    delete process.env.OLLAMA_HOST
    delete process.env.OLLAMA_API_KEY
  })

  afterEach(async () => {
    if (activeClose) {
      await activeClose()
      activeClose = undefined
    }
    if (originalOllamaHost !== undefined) {
      process.env.OLLAMA_HOST = originalOllamaHost
    } else {
      delete process.env.OLLAMA_HOST
    }
    if (originalOllamaApiKey !== undefined) {
      process.env.OLLAMA_API_KEY = originalOllamaApiKey
    } else {
      delete process.env.OLLAMA_API_KEY
    }
  })

  describe('normalizeOllamaBaseUrl & ThinkingTagParser', () => {
    it('normalizes default, OLLAMA_HOST, bare host:port, 0.0.0.0, and trailing /api or /v1 suffixes', () => {
      expect(normalizeOllamaBaseUrl()).toBe('http://127.0.0.1:11434')
      expect(normalizeOllamaBaseUrl('')).toBe('http://127.0.0.1:11434')
      expect(normalizeOllamaBaseUrl('127.0.0.1:11435')).toBe('http://127.0.0.1:11435')
      expect(normalizeOllamaBaseUrl('0.0.0.0:11434')).toBe('http://127.0.0.1:11434')
      expect(normalizeOllamaBaseUrl('http://0.0.0.0:11434/')).toBe('http://127.0.0.1:11434')
      expect(normalizeOllamaBaseUrl(':11436')).toBe('http://127.0.0.1:11436')
      expect(normalizeOllamaBaseUrl('http://localhost:11434/api/')).toBe('http://localhost:11434')
      expect(normalizeOllamaBaseUrl('http://localhost:11434/v1/')).toBe('http://localhost:11434')

      process.env.OLLAMA_HOST = '0.0.0.0:11499'
      expect(normalizeOllamaBaseUrl()).toBe('http://127.0.0.1:11499')
    })

    it('extracts inline <think>...</think> tags split across arbitrary chunk boundaries', () => {
      const parser = new ThinkingTagParser()
      const segs1 = parser.push('<thi')
      expect(segs1).toEqual([])

      const segs2 = parser.push('nk>step 1: analyze</th')
      expect(segs2).toEqual([{ type: 'reasoning', text: 'step 1: analyze' }])

      const segs3 = parser.push('ink>Final response')
      expect(segs3).toEqual([{ type: 'text', text: 'Final response' }])

      expect(parser.flush()).toEqual([])
    })

    it('flushes unclosed <think> tags as reasoning at stream end', () => {
      const parser = new ThinkingTagParser()
      const segs = parser.push('<think>partial reasoning</th')
      expect(segs).toEqual([{ type: 'reasoning', text: 'partial reasoning' }])
      expect(parser.flush()).toEqual([{ type: 'reasoning', text: '</th' }])
    })
  })

  describe('Cordis plugin registration & invariant companion', () => {
    it('exports plugin metadata, registers adapter/discovery/configurable provider/tools/systemPrompt, and disposes cleanly', () => {
      expect(name).toBe('llm-ollama')
      expect(inject).toEqual(['llm'])
      expect(Config).toBeDefined()

      const registeredAdapters: Array<{ providers: string[]; adapter: OllamaAdapter }> = []
      const registeredConfigurable: Array<readonly LlmConfigurableProvider[]> = []
      const registeredDiscovery: Array<{
        settingsNs: string
        fn: (req: LlmModelDiscoveryRequest, signal?: AbortSignal) => Promise<unknown>
      }> = []
      const registeredTools = new Map<string, { name: string; execute: (args: Record<string, unknown>, exec?: { signal?: AbortSignal }) => Promise<unknown> }>()
      const registeredPrompts: Array<{ name: string; order: number; text: string }> = []
      let disposedCount = 0

      const mockLlm = {
        registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]) {
          registeredConfigurable.push(entries)
          return () => {
            disposedCount++
          }
        },
        registerModelDiscovery(
          settingsNs: string,
          fn: (req: LlmModelDiscoveryRequest, signal?: AbortSignal) => Promise<unknown>,
        ) {
          registeredDiscovery.push({ settingsNs, fn })
          return () => {
            disposedCount++
          }
        },
        registerAdapter(providers: string[], adapter: OllamaAdapter) {
          registeredAdapters.push({ providers, adapter })
          return () => {
            disposedCount++
          }
        },
      }

      const mockTools = {
        register(toolDef: { name: string; execute: (args: Record<string, unknown>, exec?: { signal?: AbortSignal }) => Promise<unknown> }) {
          registeredTools.set(toolDef.name, toolDef)
          return () => {
            disposedCount++
          }
        },
      }

      const mockSystemPrompt = {
        section(sec: { name: string; order: number; text: string }) {
          registeredPrompts.push(sec)
          return () => {
            disposedCount++
          }
        },
      }

      const services: Record<string, unknown> = {
        llm: mockLlm,
        tools: mockTools,
        systemPrompt: mockSystemPrompt,
      }

      const mockCtx = {
        get: (key: string) => services[key],
        llm: mockLlm,
        tools: mockTools,
        systemPrompt: mockSystemPrompt,
      }

      const cleanup = apply(mockCtx as never, {
        baseURL: 'http://127.0.0.1:11434',
        enableTools: true,
      })

      expect(registeredConfigurable).toHaveLength(1)
      expect(registeredConfigurable[0]?.[0]).toMatchObject({
        provider: 'ollama',
        displayName: 'Ollama (Local)',
        settingsNs: 'llm-ollama',
        defaultBaseURL: 'http://127.0.0.1:11434',
        baseURLEnv: ['OLLAMA_HOST'],
        nativeAuth: {
          env: ['OLLAMA_API_KEY'],
          oauth: false,
        },
      })

      expect(registeredDiscovery).toHaveLength(1)
      expect(registeredDiscovery[0]?.settingsNs).toBe('llm-ollama')

      expect(registeredAdapters).toHaveLength(1)
      expect(registeredAdapters[0]?.providers).toEqual(['ollama'])
      expect(registeredAdapters[0]?.adapter.providerInfo('ollama')).toEqual({
        id: 'ollama',
        name: 'Ollama (Local)',
      })

      expect(registeredTools.has('ollama_models')).toBe(true)
      expect(registeredTools.has('ollama_status')).toBe(true)
      expect(registeredPrompts).toHaveLength(1)
      expect(registeredPrompts[0]?.name).toBe('llm:ollama')

      cleanup()
      expect(disposedCount).toBe(6)
    })

    it('registers package invariant via invariant.ts', async () => {
      let registeredPkg = ''
      const mockCtx = {
        invariants: {
          register(pkg: string) {
            registeredPkg = pkg
            return () => {}
          },
        },
      }
      await invariantPlugin.apply(mockCtx as never)
      expect(invariantPlugin.name).toBe('llm-ollama-invariant')
      expect(registeredPkg).toBe('@google/dsh-llm-ollama')
    })

    it('mounts via real Cordis await ctx.plugin(ollamaPlugin, config) without optional services, defers tools/systemPrompt injection, and streams inline ImageBlock without attachments service', async () => {
      const mock = await startMockOllamaServer((req, res) => {
        if (req.method === 'GET' && req.url === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ models: [{ name: 'gemma3:27b' }] }))
          return
        }
        if (req.method === 'POST' && req.url === '/api/chat') {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
          res.end(
            JSON.stringify({
              model: 'gemma3:27b',
              message: { role: 'assistant', content: 'Inline image received without attachments service.' },
              done: true,
              done_reason: 'stop',
              prompt_eval_count: 40,
              eval_count: 7,
            }) + '\n',
          )
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      // 1. Mount on a real Cordis Context with ONLY LlmRuntime (no tools, no systemPrompt, no attachments)
      const ctx = new Context()
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(ollamaPlugin, {
        baseURL: mock.baseUrl,
        defaultModel: 'gemma3:27b',
        enrichWithShow: false,
        enableTools: true,
      })

      expect(ctx.llm.listProviders()).toEqual([{ id: 'ollama', name: 'Ollama (Local)' }])

      // 2. Stream a user message containing an inline ImageBlock while 'attachments' service is unmounted
      const prepared = await ctx.llm.prepareCall({
        provider: 'ollama',
        model: 'gemma3:27b',
      })
      const assembler = new BlockAssembler()
      for await (const chunk of prepared.stream({
        ...prepared.config,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Inspect inline diagram' },
              {
                type: 'image',
                attachment: {
                  attachmentId: 'sha256:abcdef',
                  mediaType: 'image/png',
                  bytes: 4,
                  width: 16,
                  height: 16,
                  base64: 'iVBORw==',
                } as unknown as ImageAttachmentRef,
              },
            ],
          },
        ],
      })) {
        assembler.push(chunk)
      }

      expect(assembler.finish).toEqual({ kind: 'stop' })
      expect(assembler.blocks()).toEqual([
        { type: 'text', text: 'Inline image received without attachments service.' },
      ])
      const chatReq = mock.requests.find(r => r.url === '/api/chat')
      const sentBody = chatReq?.bodyJson as OllamaChatRequest
      expect(sentBody.messages[0]).toEqual({
        role: 'user',
        content: 'Inspect inline diagram',
        images: ['iVBORw=='],
      })

      // 3. Now mount SystemPrompt and ToolsService AFTER ollamaPlugin to verify deferred ctx.inject registration
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolsService)

      expect(ctx.tools.get('ollama_models')).toBeDefined()
      expect(ctx.tools.get('ollama_status')).toBeDefined()

      ctx.tools.setExecutor({
        describe: defs => ({ schemas: defs.map(d => projectToolSchema(d, true)) }),
        execute: async () => ({ results: [], additionalContexts: [], concluded: false }),
      })
      const assembly = await ctx.systemPrompt.assemble({})
      const rendered = renderPrompt(assembly)
      expect(rendered).toContain('provider: "ollama"')
      expect(rendered).toContain('ollama_status')
      expect(rendered).toContain('ollama_models')
    })

    it('mounts via real Cordis await ctx.plugin(ollamaPlugin, config) when optional services (tools, systemPrompt, attachments) are pre-mounted', async () => {
      const mock = await startMockOllamaServer((req, res) => {
        if (req.method === 'POST' && req.url === '/api/chat') {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
          res.end(
            JSON.stringify({
              model: 'gemma3:27b',
              message: { role: 'assistant', content: 'Stored attachment image received.' },
              done: true,
              done_reason: 'stop',
              prompt_eval_count: 48,
              eval_count: 6,
            }) + '\n',
          )
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const samplePngBytes = new Uint8Array([137, 80, 78, 71])
      const expectedBase64 = Buffer.from(samplePngBytes).toString('base64')
      const fakeAttachmentRef = {
        attachmentId: 'sha256:987654',
        mediaType: 'image/png',
        bytes: samplePngBytes.byteLength,
        width: 32,
        height: 32,
      } as unknown as ImageAttachmentRef

      const ctx = new Context()
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolsService)
      await ctx.plugin(LlmRuntime)
      ctx.provide('attachments', {
        readImage: async () => ({
          ref: fakeAttachmentRef,
          data: samplePngBytes,
        }),
      })

      await ctx.plugin(ollamaPlugin, {
        baseURL: mock.baseUrl,
        defaultModel: 'gemma3:27b',
        enrichWithShow: false,
        enableTools: true,
      })

      expect(ctx.tools.get('ollama_models')).toBeDefined()
      expect(ctx.tools.get('ollama_status')).toBeDefined()

      ctx.tools.setExecutor({
        describe: defs => ({ schemas: defs.map(d => projectToolSchema(d, true)) }),
        execute: async () => ({ results: [], additionalContexts: [], concluded: false }),
      })
      const rendered = renderPrompt(await ctx.systemPrompt.assemble({}))
      expect(rendered).toContain('provider: "ollama"')

      const prepared = await ctx.llm.prepareCall({
        provider: 'ollama',
        model: 'gemma3:27b',
      })
      const assembler = new BlockAssembler()
      for await (const chunk of prepared.stream({
        ...prepared.config,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Inspect stored attachment' },
              { type: 'image', attachment: fakeAttachmentRef },
            ],
          },
        ],
      })) {
        assembler.push(chunk)
      }

      expect(assembler.finish).toEqual({ kind: 'stop' })
      expect(assembler.blocks()).toEqual([
        { type: 'text', text: 'Stored attachment image received.' },
      ])
      const chatReq = mock.requests.find(r => r.url === '/api/chat')
      const sentBody = chatReq?.bodyJson as OllamaChatRequest
      expect(sentBody.messages[0]).toEqual({
        role: 'user',
        content: 'Inspect stored attachment',
        images: [expectedBase64],
      })
    })
  })

  describe('Dynamic Model Discovery (GET /api/tags, POST /api/show, GET /v1/models fallback, offline fallback)', () => {
    it('discovers models via GET /api/tags + POST /api/show with zero-auth and attributionHeaders()', async () => {
      const mock = await startMockOllamaServer((req, res, recorded) => {
        if (req.method === 'GET' && req.url === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              models: [
                {
                  name: 'qwen3:32b',
                  model: 'qwen3:32b',
                  size: 19851340000,
                  details: {
                    family: 'qwen3',
                    parameter_size: '32.8B',
                    quantization_level: 'Q4_K_M',
                  },
                },
                {
                  name: 'llava:13b',
                  model: 'llava:13b',
                  size: 8000000000,
                  details: {
                    family: 'llama',
                    families: ['llama', 'clip'],
                    parameter_size: '13B',
                    quantization_level: 'Q4_0',
                  },
                },
              ],
            }),
          )
          return
        }
        if (req.method === 'POST' && req.url === '/api/show') {
          const body = recorded.bodyJson as { model?: string }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          if (body?.model === 'qwen3:32b') {
            res.end(
              JSON.stringify({
                details: { family: 'qwen3', parameter_size: '32.8B', quantization_level: 'Q4_K_M' },
                model_info: { 'qwen3.context_length': 65536 },
                capabilities: ['completion', 'tools', 'thinking'],
              }),
            )
          } else {
            res.end(
              JSON.stringify({
                details: { family: 'llama', parameter_size: '13B', quantization_level: 'Q4_0' },
                model_info: { 'llama.context_length': 32768 },
                capabilities: ['completion', 'vision'],
              }),
            )
          }
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const adapter = new OllamaAdapter({
        config: { baseUrl: mock.baseUrl },
      })

      const discovered = await adapter.discoverModels()
      expect(discovered).toHaveLength(2)
      expect(discovered[0]).toMatchObject({
        id: 'qwen3:32b',
        contextWindow: 65536,
        inputModalities: ['text'],
      })
      expect(discovered[1]).toMatchObject({
        id: 'llava:13b',
        contextWindow: 32768,
        inputModalities: ['text', 'image'],
      })

      // Verify attributionHeaders() and zero-auth (no Authorization header)
      const expectedUa = attributionHeaders()['user-agent']
      for (const req of mock.requests) {
        expect(req.headers['user-agent']).toBe(expectedUa)
        expect(req.headers['authorization']).toBeUndefined()
      }

      // Verify resolveModel returns reasoning efforts for thinking models
      const resolvedQwen = await adapter.resolveModel('ollama', 'qwen3:32b')
      expect(resolvedQwen.context?.contextWindow).toBe(65536)
      expect(resolvedQwen.reasoning?.efforts.map(e => String(e.id))).toEqual(['low', 'medium', 'high'])
      expect(String(resolvedQwen.reasoning?.defaultEffort)).toBe('high')
    })

    it('falls back to GET /v1/models when GET /api/tags returns 404 and sends Bearer token when configured', async () => {
      const mock = await startMockOllamaServer((req, res) => {
        if (req.method === 'GET' && req.url === '/api/tags') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'not found' }))
          return
        }
        if (req.method === 'GET' && req.url === '/v1/models') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              object: 'list',
              data: [
                { id: 'gemma3:27b', object: 'model' },
                { id: 'deepseek-r1:32b', object: 'model' },
              ],
            }),
          )
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const adapter = new OllamaAdapter({
        config: {
          baseUrl: mock.baseUrl,
          apiKey: 'ollama-secret-token-123',
        },
      })

      const discovered = await adapter.discoverModels()
      expect(discovered.map(m => m.id)).toEqual(['gemma3:27b', 'deepseek-r1:32b'])
      expect(discovered[0]?.inputModalities).toEqual(['text', 'image'])

      expect(mock.requests).toHaveLength(2)
      expect(mock.requests[0]?.url).toBe('/api/tags')
      expect(mock.requests[1]?.url).toBe('/v1/models')
      expect(mock.requests[1]?.headers['authorization']).toBe('Bearer ollama-secret-token-123')
      expect(mock.requests[1]?.headers['user-agent']).toBe(attributionHeaders()['user-agent'])
    })

    it('returns the 5 built-in default catalog models in listModels("ollama") when daemon is offline', async () => {
      const adapter = new OllamaAdapter({
        config: { baseUrl: 'http://127.0.0.1:1' },
      })

      const models = await adapter.listModels('ollama')
      expect(models.map(m => m.id)).toEqual(DEFAULT_OLLAMA_MODELS.map(m => m.id))
      expect(models.map(m => m.id)).toEqual([
        'qwen3:32b',
        'deepseek-r1:32b',
        'llama3.3:70b',
        'gemma3:27b',
        'qwen2.5-coder:32b',
      ])
    })

    it('rejects malformed API keys containing header-injection control characters with INVALID_CREDENTIAL', async () => {
      const adapter = new OllamaAdapter({
        config: {
          baseUrl: 'http://127.0.0.1:11434',
          apiKey: 'bad-key\r\nX-Injected: true',
        },
      })

      await expect(adapter.discoverModels()).rejects.toMatchObject({
        name: 'LlmError',
        code: 'INVALID_CREDENTIAL',
      })
    })
  })

  describe('Streaming Chat Completions (POST /api/chat NDJSON)', () => {
    it('streams native message.thinking and message.content into BlockAssembler', async () => {
      const mock = await startMockOllamaServer((req, res) => {
        if (req.method === 'POST' && req.url === '/api/show') {
          res.writeHead(404)
          res.end()
          return
        }
        if (req.method === 'POST' && req.url === '/api/chat') {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
          const lines = [
            JSON.stringify({
              model: 'qwen3:32b',
              created_at: '2026-10-24T00:00:00Z',
              message: { role: 'assistant', thinking: 'Analyzing request... ', content: '' },
              done: false,
            }),
            JSON.stringify({
              model: 'qwen3:32b',
              created_at: '2026-10-24T00:00:01Z',
              message: { role: 'assistant', thinking: 'Done thinking.', content: '' },
              done: false,
            }),
            JSON.stringify({
              model: 'qwen3:32b',
              created_at: '2026-10-24T00:00:02Z',
              message: { role: 'assistant', content: 'Hello from ' },
              done: false,
            }),
            JSON.stringify({
              model: 'qwen3:32b',
              created_at: '2026-10-24T00:00:03Z',
              message: { role: 'assistant', content: 'local Qwen 3!' },
              done: true,
              done_reason: 'stop',
              prompt_eval_count: 42,
              eval_count: 18,
            }),
          ]
          res.end(lines.join('\n') + '\n')
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const adapter = new OllamaAdapter({
        config: { baseUrl: mock.baseUrl },
      })

      const prepared = await adapter.prepareCall('ollama', 'qwen3:32b')
      expect(prepared.model.id).toBe('qwen3:32b')

      const options: GenerateOptions = {
        provider: 'ollama',
        model: 'qwen3:32b',
        system: 'You are a local migration assistant.',
        reasoningEffort: ReasoningEffortId('high'),
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Greet me.' }],
          },
        ],
      }

      const assembler = new BlockAssembler()
      const chunks = await collectChunks(prepared.stream(options))
      for (const chunk of chunks) {
        assembler.push(chunk)
      }

      expect(assembler.blocks()).toEqual([
        { type: 'reasoning', text: 'Analyzing request... Done thinking.' },
        { type: 'text', text: 'Hello from local Qwen 3!' },
      ])
      expect(assembler.usage).toEqual({
        inputTokens: 42,
        outputTokens: 18,
        totalTokens: 60,
      })
      expect(assembler.finish).toEqual({ kind: 'stop' })

      const chatReq = mock.requests.find(r => r.url === '/api/chat')
      expect(chatReq).toBeDefined()
      expect(chatReq?.headers['user-agent']).toBe(attributionHeaders()['user-agent'])
      const sentBody = chatReq?.bodyJson as OllamaChatRequest
      expect(sentBody.model).toBe('qwen3:32b')
      expect(sentBody.think).toBe(true)
      expect(sentBody.messages).toEqual([
        { role: 'system', content: 'You are a local migration assistant.' },
        { role: 'user', content: 'Greet me.' },
      ])
    })

    it('streams inline <think>...</think> tags split across NDJSON chunks and TCP byte boundaries', async () => {
      const mock = await startMockOllamaServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/api/chat') {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
          const rawStream =
            JSON.stringify({ message: { role: 'assistant', content: '<thi' }, done: false }) + '\n'
            + JSON.stringify({ message: { role: 'assistant', content: 'nk>Deep R1 thought</th' }, done: false }) + '\n'
            + JSON.stringify({ message: { role: 'assistant', content: 'ink>Visible answer' }, done: false }) + '\n'
            + JSON.stringify({ message: { role: 'assistant', content: '!' }, done: true, done_reason: 'stop', prompt_eval_count: 10, eval_count: 5 }) + '\n'

          // Write in arbitrary slices to exercise partial NDJSON line buffering
          const midpoint = Math.floor(rawStream.length / 2)
          res.write(rawStream.slice(0, midpoint))
          await new Promise(resolve => setTimeout(resolve, 5))
          res.end(rawStream.slice(midpoint))
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const adapter = new OllamaAdapter({
        config: { baseUrl: mock.baseUrl, enrichWithShow: false },
      })

      const prepared = await adapter.prepareCall('ollama', 'deepseek-r1:32b')
      const assembler = new BlockAssembler()
      for await (const chunk of prepared.stream({
        provider: 'ollama',
        model: 'deepseek-r1:32b',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Solve this.' }] }],
      })) {
        assembler.push(chunk)
      }

      expect(assembler.blocks()).toEqual([
        { type: 'reasoning', text: 'Deep R1 thought' },
        { type: 'text', text: 'Visible answer!' },
      ])
      expect(assembler.finish).toEqual({ kind: 'stop' })
    })

    it('streams multi-tool calls and correlates role: "tool" ToolResultMessages in multi-turn conversations', async () => {
      const mock = await startMockOllamaServer((req, res) => {
        if (req.method === 'POST' && req.url === '/api/chat') {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
          const lines = [
            JSON.stringify({
              model: 'qwen3:32b',
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call_weather_1',
                    type: 'function',
                    function: {
                      name: 'get_weather',
                      arguments: { city: 'San Francisco', unit: 'celsius' },
                    },
                  },
                  {
                    id: 'call_time_2',
                    type: 'function',
                    function: {
                      name: 'get_time',
                      arguments: '{"timezone":"America/Los_Angeles"}',
                    },
                  },
                ],
              },
              done: false,
            }),
            JSON.stringify({
              model: 'qwen3:32b',
              done: true,
              done_reason: 'stop',
              prompt_eval_count: 55,
              eval_count: 24,
            }),
          ]
          res.end(lines.join('\n') + '\n')
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const adapter = new OllamaAdapter({
        config: { baseUrl: mock.baseUrl, enrichWithShow: false },
      })

      const priorCallId = ToolCallId('call_prior_99')
      const prepared = await adapter.prepareCall('ollama', 'qwen3:32b')
      const assembler = new BlockAssembler()

      for await (const chunk of prepared.stream({
        provider: 'ollama',
        model: 'qwen3:32b',
        tools: [
          {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Check cluster status and weather.' }],
          },
          {
            id: MessageId('msg_asst_1'),
            role: 'assistant',
            source: { kind: 'model', provider: 'ollama', model: 'qwen3:32b' },
            content: [
              {
                type: 'tool-call',
                id: priorCallId,
                name: 'mmb_assess_workload',
                arguments: '{"workload":"payments-db"}',
              },
            ],
          },
          {
            id: MessageId('msg_tool_1'),
            role: 'tool',
            toolCallId: priorCallId,
            source: { kind: 'tool', callId: priorCallId },
            content: [{ type: 'text', text: '{"score":92,"status":"ready"}' }],
          },
        ],
      })) {
        assembler.push(chunk)
      }

      expect(assembler.blocks()).toEqual([
        {
          type: 'tool-call',
          id: ToolCallId('call_weather_1'),
          name: 'get_weather',
          arguments: '{"city":"San Francisco","unit":"celsius"}',
        },
        {
          type: 'tool-call',
          id: ToolCallId('call_time_2'),
          name: 'get_time',
          arguments: '{"timezone":"America/Los_Angeles"}',
        },
      ])
      expect(assembler.finish).toEqual({ kind: 'tool-calls' })

      const chatReq = mock.requests.find(r => r.url === '/api/chat')
      const sentBody = chatReq?.bodyJson as OllamaChatRequest
      expect(sentBody.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        },
      ])
      expect(sentBody.messages[2]).toEqual({
        role: 'tool',
        content: '{"score":92,"status":"ready"}',
        tool_name: 'mmb_assess_workload',
        tool_call_id: 'call_prior_99',
      })
    })

    it('encodes user ImageBlock attachments as base64 strings in Ollama message.images', async () => {
      const mock = await startMockOllamaServer((req, res) => {
        if (req.method === 'POST' && req.url === '/api/chat') {
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
          res.end(
            JSON.stringify({
              model: 'gemma3:27b',
              message: { role: 'assistant', content: 'I see an architecture diagram.' },
              done: true,
              done_reason: 'stop',
              prompt_eval_count: 120,
              eval_count: 8,
            }) + '\n',
          )
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const samplePngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
      const expectedBase64 = Buffer.from(samplePngBytes).toString('base64')
      const fakeAttachmentRef = {
        attachmentId: 'sha256:123456',
        mediaType: 'image/png',
        bytes: samplePngBytes.byteLength,
        width: 64,
        height: 64,
      } as unknown as ImageAttachmentRef

      const adapter = new OllamaAdapter({
        config: { baseUrl: mock.baseUrl, enrichWithShow: false },
        resolveAttachments: () =>
          ({
            readImage: async () => ({
              ref: fakeAttachmentRef,
              data: samplePngBytes,
            }),
          }) as never,
      })

      const prepared = await adapter.prepareCall('ollama', 'gemma3:27b')
      const chunks = await collectChunks(
        prepared.stream({
          provider: 'ollama',
          model: 'gemma3:27b',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Describe this diagram.' },
                { type: 'image', attachment: fakeAttachmentRef },
              ],
            },
          ],
        }),
      )

      const assembler = new BlockAssembler()
      chunks.forEach(c => assembler.push(c))
      expect(assembler.blocks()).toEqual([{ type: 'text', text: 'I see an architecture diagram.' }])

      const chatReq = mock.requests.find(r => r.url === '/api/chat')
      const sentBody = chatReq?.bodyJson as OllamaChatRequest
      expect(sentBody.messages[0]).toEqual({
        role: 'user',
        content: 'Describe this diagram.',
        images: [expectedBase64],
      })
    })
  })

  describe('Error Diagnostics & Cancellation', () => {
    it('throws an actionable LlmError (code: TRANSPORT) when local Ollama daemon is unreachable', async () => {
      // Obtain an guaranteed unused ephemeral port by binding and immediately closing a server
      const closedServer = await startMockOllamaServer((_req, res) => {
        res.end()
      })
      const unreachableUrl = closedServer.baseUrl
      await closedServer.close()

      const adapter = new OllamaAdapter({
        config: { baseUrl: unreachableUrl, enrichWithShow: false },
      })

      const prepared = await adapter.prepareCall('ollama', 'qwen3:32b')
      let caughtError: unknown
      try {
        for await (const _chunk of prepared.stream({
          provider: 'ollama',
          model: 'qwen3:32b',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        })) {
          // Should not yield
        }
      } catch (err) {
        caughtError = err
      }

      expect(caughtError).toBeInstanceOf(LlmError)
      const llmErr = caughtError as LlmError
      expect(llmErr.code).toBe('TRANSPORT')
      expect(llmErr.message).toContain(unreachableUrl)
      expect(llmErr.message).toContain('ollama serve')
      expect(llmErr.message).toContain('ollama pull qwen3:32b')
      expect(llmErr.message).toContain('OLLAMA_HOST')
    })

    it('throws an actionable LlmError (status: 404) when the requested model is not pulled', async () => {
      const mock = await startMockOllamaServer((req, res) => {
        if (req.method === 'POST' && req.url === '/api/chat') {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: "model 'llama3.3:70b' not found" }))
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const adapter = new OllamaAdapter({
        config: { baseUrl: mock.baseUrl, enrichWithShow: false },
      })

      const prepared = await adapter.prepareCall('ollama', 'llama3.3:70b')
      await expect(
        collectChunks(
          prepared.stream({
            provider: 'ollama',
            model: 'llama3.3:70b',
            messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
          }),
        ),
      ).rejects.toMatchObject({
        name: 'LlmError',
        code: 'PROVIDER_HTTP',
        failure: {
          status: 404,
        },
        message: expect.stringContaining('ollama pull llama3.3:70b'),
      })
    })

    it('honors AbortSignal cancellation with LlmError (code: ABORTED)', async () => {
      const adapter = new OllamaAdapter({
        config: { baseUrl: 'http://127.0.0.1:11434', enrichWithShow: false },
      })
      const controller = new AbortController()
      controller.abort()

      const prepared = await adapter.prepareCall('ollama', 'qwen3:32b')
      await expect(
        collectChunks(
          prepared.stream({
            provider: 'ollama',
            model: 'qwen3:32b',
            signal: controller.signal,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
          }),
        ),
      ).rejects.toMatchObject({
        name: 'LlmError',
        code: 'ABORTED',
      })
    })
  })

  describe('Runtime Tools (ollama_models and ollama_status)', () => {
    it('executes ollama_models and ollama_status against online mock server and offline fallback', async () => {
      const mock = await startMockOllamaServer((req, res) => {
        if (req.method === 'GET' && req.url === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              models: [
                {
                  name: 'qwen3:32b',
                  details: { parameter_size: '32B', quantization_level: 'Q4_K_M', family: 'qwen3' },
                },
              ],
            }),
          )
          return
        }
        if (req.method === 'GET' && req.url === '/api/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ version: '0.6.2' }))
          return
        }
        if (req.method === 'GET' && req.url === '/api/ps') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              models: [
                {
                  name: 'qwen3:32b',
                  size_vram: 21474836480,
                  expires_at: '2026-10-24T01:00:00Z',
                },
              ],
            }),
          )
          return
        }
        res.writeHead(404)
        res.end()
      })
      activeClose = mock.close

      const registeredTools = new Map<
        string,
        { execute: (args: Record<string, unknown>, exec?: { signal?: AbortSignal }) => Promise<unknown> }
      >()

      apply(
        {
          get: (k: string) =>
            k === 'tools'
              ? {
                  register: (def: {
                    name: string
                    execute: (args: Record<string, unknown>, exec?: { signal?: AbortSignal }) => Promise<unknown>
                  }) => {
                    registeredTools.set(def.name, def)
                    return () => {}
                  },
                }
              : undefined,
        } as never,
        { baseUrl: mock.baseUrl, enrichWithShow: false },
      )

      const statusTool = registeredTools.get('ollama_status')
      const modelsTool = registeredTools.get('ollama_models')
      expect(statusTool).toBeDefined()
      expect(modelsTool).toBeDefined()

      const onlineStatus = (await statusTool!.execute({})) as {
        online: boolean
        version: string
        installedModelsCount: number
        runningModels: Array<{ name: string }>
      }
      expect(onlineStatus.online).toBe(true)
      expect(onlineStatus.version).toBe('0.6.2')
      expect(onlineStatus.installedModelsCount).toBe(1)
      expect(onlineStatus.runningModels[0]?.name).toBe('qwen3:32b')

      const onlineModels = (await modelsTool!.execute({})) as {
        online: boolean
        models: Array<{ id: string; thinking: boolean }>
      }
      expect(onlineModels.online).toBe(true)
      expect(onlineModels.models[0]?.id).toBe('qwen3:32b')
      expect(onlineModels.models[0]?.thinking).toBe(true)

      // Now close the server and verify graceful offline diagnostics
      await mock.close()
      activeClose = undefined

      const offlineStatus = (await statusTool!.execute({})) as {
        online: boolean
        message: string
      }
      expect(offlineStatus.online).toBe(false)
      expect(offlineStatus.message).toContain('ollama serve')

      const offlineModels = (await modelsTool!.execute({ include_fallback: true })) as {
        online: boolean
        models: Array<{ id: string }>
      }
      expect(offlineModels.online).toBe(false)
      expect(offlineModels.models).toHaveLength(5)
    })

    it('infers capabilities accurately across model families', () => {
      const gemma = inferModelCapabilities('gemma3:27b')
      expect(gemma.inputModalities).toEqual(['text', 'image'])
      expect(gemma.tools).toBe(true)

      const r1 = inferModelCapabilities('deepseek-r1:32b')
      expect(r1.thinking).toBe(true)
      expect(r1.reasoning?.efforts).toHaveLength(3)
    })
  })
})
