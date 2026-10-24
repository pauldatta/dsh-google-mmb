# dsh-google-mmb

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![Cordis](https://img.shields.io/badge/Cordis-Plugin_Architecture-orange)](https://cordis.moe/)

**Enterprise Google Cloud MMB (Migrate, Modernize, Build) Migration Center Workbench & Antigravity Suite for DeepSeek Harness.**

This repository contains modular, zero-fork plugins, tools, subagents, and profile overlays that turn [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) into an enterprise cloud migration workbench powered by Google Gemini and Google Cloud technologies—with **zero outbound calls to DeepSeek endpoints**.

---

## Architecture: Zero-Rebase Cordis Assembly

Rather than maintaining a divergent fork of DeepSeek Harness, `dsh-google-mmb` utilizes Cordis's native declarative plugin patching system (`cordis.patch.yml`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Upstream DeepSeek Harness                       │
│                   (Unmodified base runtime & UI shell)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼  --patch ./profiles/google-mmb/cordis.patch.yml
┌────────────────────────────────────────────────────────────────────────┐
│                      dsh-google-mmb Overlay Layer                      │
│                                                                        │
│  [Disabled Outbound API Rows]                                          │
│   ✖ llm-deepseek        (Prevents calls to api.deepseek.com)           │
│   ✖ web-search-deepseek (Prevents calls to search.deepseek.com)        │
│   ✖ session-log-deepseek(Disables telemetry)                           │
│                                                                        │
│  [Mounted Enterprise Plugins]                                          │
│   ✔ @google/dsh-mmb-migration-workbench  (Migration Center Studio)     │
│   ✔ @google/dsh-tool-antigravity         (Gemini Antigravity CLI Tool) │
│   ✔ @google/dsh-subagent-antigravity-cli (Antigravity ACP Subagent)   │
│   ✔ @google/dsh-llm-ollama               (Local & Remote Ollama LLM)   │
│   ✔ Default Agent Model -> Google Gemini 3.8 Flash                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Included Packages

### 1. `@google/dsh-mmb-migration-workbench` (`packages/mmb-migration-workbench`)
Full-stack Migration Center Workbench plugin providing:
- **46-Asset Portfolio Catalog**: Comprehensive evaluation of real-world enterprise cloud assets across Migrate (7), Modernize (18), and Build (21).
- **Calibrated Rubric Assessment Engine**: Deterministic scoring based on Maturity, Market Fit, and Strategic Innovation with automated penalty deduction.
- **Kubernetes Ingress-to-Gateway API Translator**: Deterministic AST translator converting legacy `networking.k8s.io/v1` Ingress manifests into GKE Gateway API (`gateway.networking.k8s.io/v1` Gateway and HTTPRoute) with internal/external load balancer classification and cross-namespace routing.
- **Modernization Recipes**: Automated transformation recipes for Spring Boot 3 / Java 21, .NET 8 Linux containers, PySpark to BigLake/Dataproc Serverless, Oracle PL/SQL to BigQuery SQL, and Kubernetes Gateway API.
- **Runtime Migration Skills**: 6 agent skills registered into the harness skill registry (`mmb-migration-discovery`, `mmb-oracle-bigquery`, `mmb-ingress-gateway`, `mmb-spring-boot-3`, `mmb-dotnet-linux-container`, `mmb-biglake-iceberg`).
- **Migration Center Studio UI**: Interactive React UI overlay with portfolio filter, workload assessment simulator, and live Ingress-to-Gateway translator.
- **REST API Routes**: `/api/mmb/stats`, `/api/mmb/catalog`, `/api/mmb/assess`, `/api/mmb/translate-ingress`, `/api/mmb/recipe`.

### 2. `@google/dsh-tool-antigravity` (`packages/tool-antigravity`)
Exposes Antigravity CLI tools to the harness agent loop:
- `antigravity_run`: Execute tasks and prompts with the Gemini model family (`gemini-3.8-flash-high`, `gemini-3.7-flash-high`, `gemini-3.1-pro-high`).
- `antigravity_models`: Query available Gemini models in the environment.
- `antigravity_agents`: Enumerate available Antigravity agent configurations.

### 3. `@google/dsh-subagent-antigravity-cli` (`packages/subagent-antigravity-cli`)
Adapter enabling DeepSeek Harness agents to delegate complex subagent tasks directly to Antigravity CLI and Agent API processes.

### 4. `@google/dsh-llm-ollama` (`packages/llm-ollama`)
First-class local and self-hosted Ollama LLM provider plugin (`provider: "ollama"`):
- **Zero-Auth Local Access & Optional Bearer Auth**: Connects to `http://127.0.0.1:11434` (or `OLLAMA_HOST`) with zero authentication required by default, plus optional Bearer token support via `OLLAMA_API_KEY`.
- **Dynamic Model Discovery**: Interrogates `GET /api/tags` and `POST /api/show` (with automatic fallback to `GET /v1/models`) to enrich local models with parameter size, quantization level, context window, vision (`['text', 'image']`), thinking/reasoning (`low`/`medium`/`high`), and tool-calling capabilities, plus a built-in 5-model fallback catalog (`qwen3:32b`, `deepseek-r1:32b`, `llama3.3:70b`, `gemma3:27b`, `qwen2.5-coder:32b`).
- **NDJSON Streaming & Thinking Extraction**: Streams `POST /api/chat` responses, extracting both native `message.thinking` and inline `<think>...</think>` blocks across chunk boundaries, function `tool_calls`, and multimodal base64 image inputs.
- **Runtime Diagnostic Tools**: Exposes `ollama_status` and `ollama_models` tools to inspect local Ollama daemon health, loaded VRAM models (`/api/ps`), and installed tags.

### 5. Enterprise Profiles (`profiles/google-mmb/`)
- `cordis.patch.yml`: Hard-disables DeepSeek API plugins and mounts Google MMB, Antigravity, and Ollama plugins (with `gemini-3.8-flash` on `google` as primary default).
- `agent.cordis.yml`: Agent presets configured for Gemini 3.8 Flash (default), Gemini 3.7 Flash, Gemini 3.1 Pro Preview, and local Ollama presets (`ollama-qwen3-32b`, `ollama-deepseek-r1-32b`, `ollama-gemma3-27b`, `ollama-qwen2.5-coder-32b`, `ollama-llama3.3-70b`).

---

## Local Open-Weight Models with Ollama (`@google/dsh-llm-ollama`)

While Google Gemini (`gemini-3.8-flash`) is the primary default model, you can seamlessly switch to local open-weight models served by Ollama:

```bash
# 1. Start the local Ollama daemon (when installed on your workstation)
ollama serve

# 2. Pull one or more recommended local models
ollama pull qwen3:32b
ollama pull deepseek-r1:32b
ollama pull gemma3:27b
ollama pull qwen2.5-coder:32b
ollama pull llama3.3:70b
```

Select any `ollama-*` preset in the UI/CLI or switch models dynamically via `/model ollama/qwen3:32b`.

---

## Getting Started

### Prerequisites
- Node.js >= 22.0.0
- `pnpm` >= 9.0.0
- DeepSeek Harness installed or available on PATH
- Google Gemini API key or Google Cloud Application Default Credentials (ADC), or a local Ollama server

### Environment Variables
Configure your environment:
```bash
export GEMINI_API_KEY="your-gemini-api-key"
# Or configure Google Cloud project & location:
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GOOGLE_CLOUD_LOCATION="global"

# Optional local/remote Ollama configuration:
export OLLAMA_HOST="http://127.0.0.1:11434"
export OLLAMA_API_KEY="" # Optional Bearer token for authenticated remote Ollama proxies

# Optional server configuration:
export HOST="0.0.0.0"
export PORT="31415"
```

### Running with DeepSeek Harness
Boot upstream DeepSeek Harness with the Google MMB profile overlay:

```bash
# Using the dsh CLI directly
dsh web --patch ./profiles/google-mmb/cordis.patch.yml

# Or using the included runner script
./bin/run.sh
```

---

## REST API Reference

When mounted, the following endpoints are available on the web server:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/mmb/stats` | Returns asset counts, domain breakdown, and catalog statistics |
| `GET` | `/api/mmb/catalog` | Filter catalog assets by `?domain=`, `?q=`, `?minScore=` |
| `POST` | `/api/mmb/assess` | Submit a workload assessment request for automated rubric scoring |
| `POST` | `/api/mmb/translate-ingress` | Submit an Ingress manifest for automated Gateway API translation |
| `POST` | `/api/mmb/recipe` | Run or simulate a modernization recipe dry run |

---

## Unit Testing

Run the test suite:
```bash
pnpm test
```

The test suite covers:
- Asset catalog distribution and scoring benchmarks
- Calibrated rubric formula and penalty enforcement
- Ingress-to-Gateway API AST generation and edge cases
- Modernization recipe execution
- Antigravity CLI binary discovery and environment building
- Ollama LLM adapter discovery (`/api/tags`, `/api/show`, `/v1/models`), NDJSON streaming, `<think>` extraction, tool calls, multimodal vision, and offline diagnostics

---

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.
