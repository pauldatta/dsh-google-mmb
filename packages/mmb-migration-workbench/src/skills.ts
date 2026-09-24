/**
 * Baked-in mature MMB skills registered into DeepSeek Harness ctx.skills.
 * Retains only the 5 high-value, production-grade practitioner skills.
 *
 * @module @deepseek-ai/dsh-mmb-migration-workbench/skills
 */

import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

export interface PractitionerSkillInfo {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly whenToUse: string
  readonly workflowSteps: readonly string[]
  readonly starterPrompts: readonly string[]
  readonly content: string
}

export const PRACTITIONER_SKILLS: readonly PractitionerSkillInfo[] = [
  {
    name: 'mmb-discovery-wave-planner',
    title: 'Workspace Discovery, TCO & 4-Wave Rollout Planner',
    description: 'Automated codebase discovery, dependency matrix extraction, 4-wave migration scheduling, and enterprise TCO financial impact analysis.',
    whenToUse: 'At the start of any enterprise migration engagement to evaluate architecture, dependencies, effort, and wave rollout.',
    workflowSteps: [
      'Scan workspace files and identify source stack (Java, .NET, Python, Oracle, K8s, Hadoop).',
      'Calculate 2026 Calibrated Scoring Rubric (Maturity, Market Fit, Innovation).',
      'Generate 4-Wave Migration Timeline (Discovery, Pilot, Core Migration, Cutover).',
      'Model baseline vs AI-accelerated effort and calculate TCO financial savings.',
      'Output formatted executive markdown report ready for leadership review.',
    ],
    starterPrompts: [
      'Run automated workspace discovery on this project and generate the 4-wave migration timeline.',
      'Analyze our source dependencies and model expected TCO savings moving to Google Cloud serverless.',
      'Produce an executive migration assessment report for our leadership team.',
    ],
    content: `# MMB Multi-Cloud Discovery, TCO & 4-Wave Rollout Planner Skill

## Purpose
Execute systematic discovery across AWS, Azure, or on-prem workloads to identify candidate databases, compute workloads, and storage buckets for Google Cloud migration.

## Workflow
1. **Workload Inventory**: Inspect VM instances, container clusters, databases (Oracle, SQL Server, Postgres), and object storage buckets.
2. **Network Topology Scan**: Evaluate CIDR blocks, VPC peering, VPN/Interconnect bandwidth requirements, and egress costs.
3. **Data Volume & Throughput Analysis**: Measure database size (GB/TB), change rates (MB/s), and IOPS to determine CDC stream bandwidth.
4. **Target GCP Architecture Mapping**:
   - Oracle Databases -> BigQuery (Analytics/BQML) + AlloyDB for PostgreSQL (OLTP)
   - Kubernetes Ingress -> GKE Gateway API (HTTPRoute)
   - Hadoop / HDFS -> Cloud Storage + BigLake (Iceberg) + Dataproc Serverless
   - Monolithic Applications -> Cloud Run (Serverless Containers)
5. **Call \`mmb_assess_workload\`**: Run automated rubric scoring to calculate calibrated feasibility, risk factors, wave plan, and effort/TCO model.
`,
  },
  {
    name: 'mmb-database-migration',
    title: 'Oracle / SQL Server / Postgres → AlloyDB & BigQuery Migration Architect',
    description: 'Zero-downtime database replication, Datastream CDC private connections, automated PL/SQL to BigQuery SQL translation, and AlloyDB AI ScaNN vector search.',
    whenToUse: 'When migrating mission-critical relational databases (Oracle, SQL Server, PostgreSQL) to BigQuery or AlloyDB.',
    workflowSteps: [
      'Inspect database dictionary for proprietary types (LOBs, XML, custom types, sequences).',
      'Configure Datastream CDC private VPC connection and BigQuery destination.',
      'Apply automated SQL dialect translation to PL/SQL queries and stored procedures.',
      'Validate row counts and checksums across source and target tables during dual-run.',
      'Enable AlloyDB AI pgvector ScaNN index for operational GenAI retrieval.',
    ],
    starterPrompts: [
      'Inspect our database schema and design a Datastream CDC pipeline to BigQuery and AlloyDB.',
      'Translate these Oracle PL/SQL stored procedures into ANSI-compliant BigQuery Standard SQL.',
      'Configure AlloyDB with the ScaNN pgvector extension for sub-millisecond similarity search.',
    ],
    content: `# MMB Database Migration Architect Skill (Oracle, SQL Server, Postgres)

## Purpose
Migrate proprietary Oracle, SQL Server, and self-managed Postgres workloads to Google Cloud BigQuery and AlloyDB using Datastream CDC and Model Context Protocol (MCP) agents.

## Architecture
- **Source**: Oracle 11g-19c, SQL Server 2012-2019, or PostgreSQL on Compute Engine or on-premises.
- **Ingestion**: Google Cloud Datastream CDC (Change Data Capture) via LogMiner / Replication slots.
- **Staging & Storage**: Cloud Storage staging bucket -> BigQuery bronze tables or AlloyDB.
- **Deduplication**: BigQuery scheduled queries or BigQuery Continuous Queries merging CDC changes.
- **Predictive AI**: BigQuery ML \`ARIMA_PLUS\` time-series forecasting and AlloyDB ScaNN vector search.

## Instructions
1. **Prerequisites Verification**:
   - Ensure Oracle ARCHIVELOG mode and supplemental logging are enabled.
   - Provision dedicated Datastream user with \`SELECT ANY TRANSACTION\`, \`EXECUTE_CATALOG_ROLE\`.
2. **Datastream Stream Creation**:
   - Set up private connectivity configuration (VPC Peering or Cloud VPN).
   - Configure BigQuery destination dataset with automatic schema evolution.
3. **Historical Backfill**:
   - Perform initial table data backfill while tracking SCN (System Change Number).
4. **Validation & Cutover**:
   - Check row counts and cryptographic checksums between source and target tables.
   - Run BQML forecasting queries on migrated analytical datasets.
`,
  },
  {
    name: 'mmb-app-modernization',
    title: 'Java Spring Boot 3 & .NET 8 Cloud-Native Refactoring Specialist',
    description: 'Automated codebase refactoring for enterprise Java and .NET monoliths: Java 21, Spring Boot 3, .NET 8 Linux, Jib distroless packaging, and Cloud Run targeting.',
    whenToUse: 'When modernizing legacy monolithic applications to containerized serverless runtimes (Cloud Run, GKE).',
    workflowSteps: [
      'Analyze pom.xml / *.csproj to flag deprecated framework dependencies and APIs.',
      'Execute OpenRewrite AST recipes for Spring Boot 2->3 or .NET Framework->.NET 8.',
      'Configure distroless container builds (Jib for Java, multi-stage Linux for .NET).',
      'Run hermetic verification test suite to ensure zero functional regressions.',
      'Generate Cloud Run deployment manifests with Workload Identity and Cloud SQL proxy.',
    ],
    starterPrompts: [
      'Refactor our Spring Boot 2 application to Spring Boot 3 with Java 21 and Cloud Run Jib packaging.',
      'Convert our legacy Windows .NET Framework project to .NET 8 Linux containers on Cloud Run.',
      'Run hermetic build verification tests to confirm zero syntax errors after migration.',
    ],
    content: `# MMB Application Modernization Skill (Java & .NET to Cloud Run)

## Purpose
Refactor enterprise Java (Spring Boot) and .NET applications for containerized deployment on Google Cloud Run and GKE, enforced by automated build-verification loops.

## Guidelines
1. **Java Modernization**:
   - Upgrade Spring Boot 2.x to 3.x, migrating \`javax.*\` to \`jakarta.*\` packages.
   - Adopt Google Cloud Spring starters for Cloud SQL, Pub/Sub, and Cloud Storage.
   - Configure Google Container Tools Jib for distroless, non-root Docker builds.
2. **.NET Modernization**:
   - Migrate .NET Framework (4.7/4.8) to .NET 8 Linux LTS.
   - Replace IIS/WCF dependencies with ASP.NET Core Web APIs.
   - Generate multi-stage Dockerfile targeting \`mcr.microsoft.com/dotnet/aspnet:8.0\`.
3. **Hermetic Verification**:
   - Always run \`mvn test\` or \`dotnet test\` to verify compilation and test passage before completing changes.
`,
  },
  {
    name: 'mmb-lakehouse-modernization',
    title: 'Hadoop / Spark / EDW → Dataproc Serverless & BigLake Iceberg',
    description: 'Legacy data lakehouse modernization: migrating on-prem HDFS to Cloud Storage, PySpark to Dataproc Serverless Batches, and EDW to BigQuery Studio.',
    whenToUse: 'When retiring legacy Hadoop/Cloudera clusters, Spark on YARN, or Teradata/Snowflake data warehouses.',
    workflowSteps: [
      'Catalog HDFS data partitions, formats (Parquet/ORC), and Airflow/Oozie DAG workflows.',
      'Provision Cloud Storage buckets with BigLake Apache Iceberg open table format.',
      'Rewrite PySpark hdfs:// path references to gs:// with Dataproc Serverless Batches API.',
      'Validate SQL dialect compatibility between Spark SQL and BigQuery SQL.',
      'Transition scheduled batch pipelines to Cloud Composer or Cloud Workflows.',
    ],
    starterPrompts: [
      'Modernize our PySpark batch jobs from on-prem HDFS to Google Cloud Dataproc Serverless.',
      'Design an Apache Iceberg BigLake table structure on Cloud Storage with Dataplex governance.',
      'Validate our legacy Hive/Spark SQL queries against BigQuery Standard SQL.',
    ],
    content: `# MMB Lakehouse & EDW Modernization Skill (Hadoop, Spark, Teradata to BigLake)

## Purpose
Modernize legacy Cloudera/Hadoop environments, HDFS data lakes, and PySpark batch jobs to Google Cloud Dataproc Serverless and BigLake Iceberg tables.

## Steps
1. **HDFS Storage Migration**:
   - Transfer historical HDFS data to Cloud Storage buckets using Google Cloud Storage Transfer Service.
2. **Iceberg / BigLake Table Definition**:
   - Define BigLake managed tables on Cloud Storage with Apache Iceberg open table format.
3. **PySpark Code Modernization**:
   - Replace \`hdfs://\` URI schemes with \`gs://\`.
   - Remove hardcoded cluster master configurations (\`spark.master = "yarn"\`).
   - Package PySpark scripts to execute on Dataproc Serverless Batches API.
4. **AST Parity Verification**:
   - Verify SQL dialect compatibility between Spark SQL and BigQuery SQL to eliminate hallucinations.
`,
  },
  {
    name: 'mmb-cloud-replatform',
    title: 'AWS / Azure → GCP Landing Zone, GKE Gateway & Terraform Translator',
    description: 'Multi-cloud replatforming: AWS EKS to GKE Enterprise, Ingress to Gateway API, Cloud Armor security policies, and Terraform HCL resource translation.',
    whenToUse: 'When migrating workloads from AWS or Azure to Google Cloud or upgrading Kubernetes networking to Gateway API.',
    workflowSteps: [
      'Scan multi-cloud Terraform / CloudFormation configurations and map equivalent GCP resources.',
      'Convert Kubernetes Ingress manifests to GKE Gateway API (Gateway + HTTPRoute).',
      'Configure Google Cloud Armor edge WAF policies and DDoS protection rules.',
      'Setup Workload Identity Federation for AWS cross-cloud IAM service accounts.',
      'Execute weighted DNS canary routing for zero-downtime cutover.',
    ],
    starterPrompts: [
      'Convert our AWS Terraform infrastructure and boto3 Python code into Google Cloud equivalents.',
      'Translate our Kubernetes Ingress manifests into GKE Gateway API and Cloud Armor policies.',
      'Design a dual-cloud weighted DNS canary cutover plan from AWS to Google Cloud.',
    ],
    content: `# MMB Cloud Replatform & GKE Gateway API Skill (AWS/Azure to GCP)

## Purpose
Translate multi-cloud infrastructure and ingress networking into native Google Cloud architectures (GKE Enterprise, Gateway API, Cloud Armor, and Terraform).

## Rules & Conversion Mapping
1. **GatewayClass Selection**:
   - External Global LB: \`gke-l7-global-external-managed\`
   - Regional Internal LB: \`gke-l7-rilb\`
2. **HTTPRoute Mapping**:
   - Ingress \`spec.rules[].host\` -> HTTPRoute \`spec.hostnames\`
   - Ingress \`spec.rules[].http.paths\` -> HTTPRoute \`spec.rules[].matches\`
   - PathPrefix matching (\`pathType: Prefix\`) -> \`type: PathPrefix\`
   - Backend service reference -> \`backendRefs[].name\` and \`backendRefs[].port\`
3. **Execution**:
   - Use the \`mmb_ingress_translate\` tool to execute deterministic manifest translation.
   - Test manifests with \`kubectl apply -f route.yaml --dry-run=client\`.
`,
  },
]

export const MMB_RUNTIME_SKILLS: readonly SkillRegistration[] = PRACTITIONER_SKILLS.map(s => ({
  name: s.name,
  description: s.description,
  source: 'runtime',
  content: s.content,
}))
