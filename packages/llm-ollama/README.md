# `@google/dsh-llm-ollama`

First-class local and remote Ollama LLM provider plugin (`provider: "ollama"`) for DeepSeek Harness (`@deepseek-ai/dsh-llm` `0.2.1-rc.3`).

## Features

- **`OllamaAdapter extends LlmAdapter`**: Implements `prepareCall(provider, model, signal)` returning `Promise<PreparedAdapterCall>` and streams NDJSON chunks from `POST /api/chat` into `StreamChunk` events compatible with `BlockAssembler`.
- **Dynamic Model Discovery & Offline Fallback**: Queries `GET /api/tags` (with `/v1/models` fallback) and optional `POST /api/show` enrichment, falling back to a 5-model default catalog (`qwen3:32b`, `deepseek-r1:32b`, `llama3.3:70b`, `gemma3:27b`, `qwen2.5-coder:32b`) when the local daemon is offline.
- **Reasoning & Tool Calling**: Supports native `message.thinking` deltas, stateful `<think>...</think>` tag splitting across chunk boundaries, `ReasoningEffortId` mapping (`minimal` / `low` / `medium` / `high` / `xhigh`), and bidirectional tool-call translation.
- **Multimodal Vision**: Resolves `image` content blocks (`AttachmentStore`) into base64-encoded `images` arrays for vision-capable models (`gemma3`, `llava`, `qwen2.5vl`, `llama3.2-vision`, `pixtral`, `minicpm-v`, `moondream`, `bakllava`).
- **Diagnostic Tools**: Registers `ollama_models` and `ollama_status` tools via `@deepseek-ai/dsh-tools`.
