# @google/dsh-mmb-migration-workbench

Full-Stack Google MMB (Migrate, Modernize, Build) Migration Center Workbench for DeepSeek Harness.

This Cordis extension transforms the DeepSeek Harness into a specialized enterprise migration and modernization workbench, integrating asset assessments, automated scoring, AST infrastructure translation, modernization recipes, and runtime agent skills.

---

## Features

### 1. 46-Asset Portfolio Catalog
Catalogues 46 evaluated real-world enterprise assets from `GoogleCloudPlatform/cloud-solutions`:
- **Migrate (7 assets)**: e.g., `oracle-bigquery-mcp-agent` (Score: 3.5), `hadoop-to-lakehouse-migration-demo` (Score: 2.6).
- **Modernize (18 assets)**: e.g., `k8s-hybrid-neg-controller` (Score: 3.2), `operational-ai-leap` (Score: 3.0), `gke-migration-agent / ingress2gateway` (Score: 2.7), `legacy-detox-demo` (Score: 2.7), `dotnet-modernization-demo` (Score: 2.0), `java-modernization-demo` (Score: 1.8).
- **Build (21 assets)**: e.g., `arm-reference-guides` (Score: 2.8), `mmb-datacloud` (Score: 2.2).
- Accurate categorization of 19 archived stubs (capped at 0.6).

### 2. Calibrated Rubric Assessment Engine
Deterministic scoring model:
$$\text{Score} = (0.35 \times \text{Maturity}) + (0.35 \times \text{Market Fit}) + (0.30 \times \text{Strategic Innovation})$$
- Automated penalty deductions:
  - Missing tests: `-0.4`
  - Archive/stub status: hard cap at `0.6`
- Workload recommendation generator outputting:
  - Maturity grade (Production Ready, Enterprise Recommended, Experimental, Archived Stub)
  - Workload complexity & estimated duration
  - Prescribed execution phases & target modern GCP destination architecture

### 3. Ingress-to-Gateway API AST Translator
Automated AST parser and generator converting Kubernetes `networking.k8s.io/v1 Ingress` resources into:
- `gateway.networking.k8s.io/v1 Gateway` (Internal or External GKE Gateway classes)
- `gateway.networking.k8s.io/v1 HTTPRoute` with path-rule matchers, rewrite filters, and service backend refs
- Automatic `gateway.networking.k8s.io/v1beta1 ReferenceGrant` emission when cross-namespace service routing is detected

### 4. Enterprise Modernization Recipes
Simulation engine with pre-packaged recipes:
1. `oracle-to-bigquery`: Schema migration, PL/SQL translation, and BigQuery data pipelines.
2. `ingress-to-gateway`: GKE networking upgrade from Ingress controller to Gateway API.
3. `modernize-dotnet-core`: Legacy .NET Framework migration to modern containerized .NET 8 / Cloud Run.
4. `spring-boot-upgrade`: Java 8/11 to Java 21, Spring Boot 2 to 3 migration.
5. `hadoop-to-bigquery`: Hive/Spark to Dataproc Serverless and BigQuery Studio.
6. `hybrid-neg-controller`: Hybrid multi-cluster networking with GKE Hybrid NEGs.

### 5. Mature Runtime Skills
Baked-in agent instruction skill files:
- `mmb-asset-assessment`
- `ingress-to-gateway`
- `oracle-bigquery-migration`
- `dotnet-modernization`
- `java-modernization`
- `hadoop-lakehouse-modernization`

---

## Tools Exposed to Harness Agents

When mounted, the plugin exposes the following Cordis tools to the agent loop:

- `mmb_assess_workload`: Run the calibrated rubric assessment against any target workload description.
- `mmb_catalog_search`: Query the 46 evaluated GCP cloud-solutions assets by domain, query, or minimum score.
- `mmb_translate_ingress`: Translate Kubernetes Ingress YAML into Gateway API and HTTPRoute YAML.
- `mmb_simulate_recipe`: Execute a dry-run simulation of a modernization recipe against target repository paths.

---

## REST API Endpoints

The extension mounts HTTP handlers on the harness web server:

- `GET /api/mmb/stats` — High-level statistics on assets, domains, and recipes.
- `GET /api/mmb/catalog` — Query catalog assets with optional `?domain=`, `?q=`, and `?minScore=` filters.
- `POST /api/mmb/assess` — Score a workload with parameters `{ workloadName, domain, ... }`.
- `POST /api/mmb/translate-ingress` — Translate Ingress YAML payload `{ ingressYaml, gatewayName?, gatewayNamespace? }`.
- `POST /api/mmb/simulate-recipe` — Run recipe simulation `{ recipeId, dryRun, targetPath }`.

---

## Configuration

In `packages/bundle/web-app/cordis.patch.yml`:

```yaml
plugins:
  host:
    - id: mmb-migration-workbench
      name: "@google/dsh-mmb-migration-workbench"
      config:
        enableHttpRoutes: true
        enableRuntimeSkills: true
```

---

## Testing

Run the comprehensive unit test suite (25 tests covering catalog, scoring rubric, translator AST, recipes, and Cordis lifecycle):

```bash
pnpm --filter @google/dsh-mmb-migration-workbench test
```
