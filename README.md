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
│   ✔ Default Agent Model -> Google Gemini 3.7 Flash                     │
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
- `antigravity_run`: Execute tasks and prompts with the Gemini model family (`gemini-3.7-flash-high`, `gemini-3.1-pro-high`).
- `antigravity_models`: Query available Gemini models in the environment.
- `antigravity_agents`: Enumerate available Antigravity agent configurations.

### 3. `@google/dsh-subagent-antigravity-cli` (`packages/subagent-antigravity-cli`)
Adapter enabling DeepSeek Harness agents to delegate complex subagent tasks directly to Antigravity CLI and Agent API processes.

### 4. Enterprise Profiles (`profiles/google-mmb/`)
- `cordis.patch.yml`: Hard-disables DeepSeek API plugins and mounts Google MMB plugins.
- `agent.cordis.yml`: Agent presets configured for Gemini 3.7 Flash and Gemini 3.1 Pro Preview.

---

## Getting Started

### Prerequisites
- Node.js >= 22.0.0
- `pnpm` >= 9.0.0
- DeepSeek Harness installed or available on PATH
- Google Gemini API key or Google Cloud Application Default Credentials (ADC)

### Environment Variables
Configure your environment:
```bash
export GEMINI_API_KEY="your-gemini-api-key"
# Or configure Google Cloud project & location:
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GOOGLE_CLOUD_LOCATION="global"

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

---

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.
