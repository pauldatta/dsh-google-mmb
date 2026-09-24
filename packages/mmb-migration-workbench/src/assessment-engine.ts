/**
 * MMB Assessment Engine: implements the 2026 Calibrated Scoring Rubric
 * and provides automated workload readiness assessments.
 * @module @deepseek-ai/dsh-mmb-migration-workbench/assessment-engine
 */

import type {
  DimensionScores,
  PenaltyDeduction,
  WorkloadAssessmentRequest,
  WorkloadType,
  CloudSource,
} from './types.ts'

export interface RubricEvaluation {
  readonly rawScore: number
  readonly calibratedScore: number
  readonly dimensionScores: DimensionScores
  readonly penalties: readonly PenaltyDeduction[]
}

export interface WavePlanItem {
  readonly wave: string
  readonly durationWeeks: number
  readonly focus: string
  readonly deliverables: readonly string[]
  readonly exitCriteria: string
}

export interface EffortBreakdown {
  readonly discoveryWeeks: number
  readonly engineeringWeeks: number
  readonly testingCutoverWeeks: number
}

export interface EffortEstimate {
  readonly baselinePersonWeeks: number
  readonly aiAcceleratedPersonWeeks: number
  readonly savingsPercent: number
  readonly breakdown: EffortBreakdown
}

export interface TcoModel {
  readonly estimatedAnnualSavingsPercent: number
  readonly licenseOptimization: string
  readonly opsEfficiencyGain: string
  readonly riskMitigationSummary: string
}

export interface WorkloadAssessmentResult {
  readonly workloadType: WorkloadType
  readonly sourcePlatform: CloudSource
  readonly sourceTechnology: string
  readonly rawScore: number
  readonly calibratedScore: number
  readonly dimensionScores: DimensionScores
  readonly penaltiesApplied: readonly PenaltyDeduction[]
  readonly complexity: 'Low' | 'Moderate' | 'High' | 'Critical'
  readonly recommendedTarget: string
  readonly recommendedBlueprints: readonly string[]
  readonly recommendedSkills: readonly string[]
  readonly actionPlan: readonly string[]
  readonly riskFactors: readonly string[]
  readonly wavePlan: readonly WavePlanItem[]
  readonly effortEstimate: EffortEstimate
  readonly tcoModel: TcoModel
  readonly markdownReport: string
}

/**
 * Calculates calibrated assessment score based on 3-dimension formula:
 * Raw Score = (0.35 * Maturity) + (0.35 * MarketFit) + (0.30 * Innovation)
 * Calibrated Score = min(Raw Score - Penalties, HardCap)
 */
export function evaluateRubric(
  maturity: number,
  marketFit: number,
  innovation: number,
  options?: {
    isArchivedStub?: boolean | undefined
    isDocOnly?: boolean | undefined
    isHollowSkeleton?: boolean | undefined
    isCopiedThirdParty?: boolean | undefined
    isNotebookOnly?: boolean | undefined
    hasTests?: boolean | undefined
  },
): RubricEvaluation {
  let codeMaturity = Math.max(0, Math.min(5, maturity))
  if (options?.hasTests === true) {
    codeMaturity = Math.min(5, codeMaturity + 0.2)
  }
  const fit = Math.max(0, Math.min(5, marketFit))
  const archInnovation = Math.max(0, Math.min(5, innovation))

  const rawScore = Number((0.35 * codeMaturity + 0.35 * fit + 0.30 * archInnovation).toFixed(2))
  const penalties: PenaltyDeduction[] = []
  let deduction = 0
  let hardCap = 5.0

  if (options?.isArchivedStub) {
    hardCap = Math.min(hardCap, 0.6)
    penalties.push({ reason: 'Archived Stub (zero active code files)', deduction: 2.0 })
  }
  if (options?.isDocOnly) {
    hardCap = Math.min(hardCap, 1.3)
    penalties.push({ reason: 'Documentation-only (lacks runnable automation or CLI)', deduction: 1.5 })
  }
  if (options?.isHollowSkeleton) {
    penalties.push({ reason: 'Hollow skeleton (<100 LOC of actual agentic logic)', deduction: 2.0 })
    deduction += 2.0
  }
  if (options?.isCopiedThirdParty) {
    penalties.push({ reason: 'Third-party copied sample without transformation tooling', deduction: 1.5 })
    deduction += 1.5
  }
  if (options?.isNotebookOnly) {
    penalties.push({ reason: 'Notebook-only / unhardened POC logic', deduction: 1.5 })
    deduction += 1.5
  }
  if (options?.hasTests === false) {
    penalties.push({ reason: 'Untested Workload (zero automated regression tests)', deduction: 0.5 })
    deduction += 0.5
  }

  const scoreAfterDeductions = Math.max(0.6, rawScore - deduction)
  const calibratedScore = Number(Math.min(scoreAfterDeductions, hardCap).toFixed(1))

  return {
    rawScore,
    calibratedScore,
    dimensionScores: { codeMaturity, marketFit: fit, architecturalInnovation: archInnovation },
    penalties,
  }
}

/**
 * Assesses an enterprise customer workload across Migrate, Modernize, and Build pillars.
 */
export function assessWorkload(request: WorkloadAssessmentRequest): WorkloadAssessmentResult {
  const techLower = request.sourceTechnology.toLowerCase()
  let detectedType = request.workloadType

  if (detectedType === 'general') {
    if (techLower.includes('oracle') || techLower.includes('sql') || techLower.includes('postgres')) {
      detectedType = 'database'
    } else if (techLower.includes('ingress') || techLower.includes('k8s') || techLower.includes('kubernetes')) {
      detectedType = 'kubernetes'
    } else if (techLower.includes('spark') || techLower.includes('hadoop') || techLower.includes('hive')) {
      detectedType = 'data-pipeline'
    } else {
      detectedType = 'application'
    }
  }

  switch (detectedType) {
    case 'database':
      return assessDatabaseWorkload(request)
    case 'kubernetes':
      return assessKubernetesWorkload(request)
    case 'data-pipeline':
      return assessDataPipelineWorkload(request)
    case 'application':
    default:
      return assessApplicationWorkload(request)
  }
}

function computeComplexity(
  baseComplexity: 'Low' | 'Moderate' | 'High' | 'Critical',
  scale: 'small' | 'medium' | 'large' | 'enterprise' | undefined,
): 'Low' | 'Moderate' | 'High' | 'Critical' {
  if (scale === 'enterprise') return 'Critical'
  if (scale === 'small' && baseComplexity !== 'Critical') return 'Low'
  return baseComplexity
}

function augmentRisksAndPlans(
  request: WorkloadAssessmentRequest,
  baseActionPlan: readonly string[],
  baseRiskFactors: readonly string[],
): { actionPlan: string[]; riskFactors: string[] } {
  const actionPlan = [...baseActionPlan]
  const riskFactors = [...baseRiskFactors]

  if (request.hasTests === false) {
    riskFactors.unshift('Workload lacks automated test coverage; regression risk during migration is elevated.')
    actionPlan.splice(1, 0, '1b. Automated Test Baseline: Establish smoke and contract test suite prior to cutover.')
  }

  if (request.workloadScale === 'enterprise') {
    riskFactors.push('Enterprise scale (>50 TB / high QPS) requires dedicated interconnect bandwidth and multi-region failover.')
    actionPlan.push('Enterprise Resilience: Validate multi-region failover and partitioned cutover strategy.')
  }

  return { actionPlan, riskFactors }
}

export function generateWavePlan(
  _workloadType: WorkloadType,
  scale: 'small' | 'medium' | 'large' | 'enterprise' | undefined,
  complexity: 'Low' | 'Moderate' | 'High' | 'Critical',
): WavePlanItem[] {
  const isEnterprise = scale === 'enterprise' || complexity === 'Critical'
  const isLarge = scale === 'large' || complexity === 'High'

  const wave0Weeks = isEnterprise ? 3 : 2
  const wave1Weeks = isEnterprise ? 4 : isLarge ? 3 : 2
  const wave2Weeks = isEnterprise ? 6 : isLarge ? 5 : 4
  const wave3Weeks = isEnterprise ? 3 : 2

  return [
    {
      wave: 'Wave 0: Discovery & Landing Zone',
      durationWeeks: wave0Weeks,
      focus: 'Automated workspace scanning, dependency discovery, security baseline, and target GCP landing zone setup.',
      deliverables: [
        'Source architecture inventory & dependency matrix',
        'GCP VPC network peering & IAM Workload Identity federation',
        'Automated AST migration pipeline pre-flight',
      ],
      exitCriteria: 'Stakeholder sign-off on discovery metrics and security compliance.',
    },
    {
      wave: 'Wave 1: Pilot & Dual-Run',
      durationWeeks: wave1Weeks,
      focus: 'Deploy pilot workload slice, configure CDC replication/canary routing, establish rollback checkpoints.',
      deliverables: [
        'Pilot workload deployed to GCP target service',
        'Dual-run telemetry & shadow verification pipeline',
        'Automated regression test baseline',
      ],
      exitCriteria: 'Zero data drift or 99.99% parity for 7 consecutive days in dual-run.',
    },
    {
      wave: 'Wave 2: Core Migration & Modernization',
      durationWeeks: wave2Weeks,
      focus: 'Full AST-driven transformation, data backfill, and production cluster cutover preparation.',
      deliverables: [
        'Automated recipe execution across all modules',
        'Full historical data backfill & catch-up sync',
        'Disaster recovery and multi-region failover rehearsal',
      ],
      exitCriteria: 'Performance and throughput equal or superior to source environment under load testing.',
    },
    {
      wave: 'Wave 3: Production Cutover & Decommission',
      durationWeeks: wave3Weeks,
      focus: 'DNS traffic migration, legacy decommissioning, and post-cutover AI enablement.',
      deliverables: [
        'Production DNS / client cutover execution',
        '24/7 hypercare monitoring & SLO alerting in Cloud Monitoring',
        'Legacy platform decommission and cost shutdown confirmation',
      ],
      exitCriteria: 'Production steady-state error rate < 0.01% and zero P1 incidents for 14 days.',
    },
  ]
}

export function generateEffortEstimate(
  scale: 'small' | 'medium' | 'large' | 'enterprise' | undefined,
  complexity: 'Low' | 'Moderate' | 'High' | 'Critical',
): EffortEstimate {
  let baseline = 16
  if (scale === 'enterprise' || complexity === 'Critical') {
    baseline = 52
  } else if (scale === 'large' || complexity === 'High') {
    baseline = 36
  } else if (scale === 'medium' || complexity === 'Moderate') {
    baseline = 24
  }

  const aiAccelerated = Math.round(baseline * 0.55)
  const savingsPercent = Math.round((1 - aiAccelerated / baseline) * 100)

  const discoveryWeeks = Math.max(1, Math.round(aiAccelerated * 0.2))
  const engineeringWeeks = Math.max(2, Math.round(aiAccelerated * 0.55))
  const testingCutoverWeeks = Math.max(1, aiAccelerated - discoveryWeeks - engineeringWeeks)

  return {
    baselinePersonWeeks: baseline,
    aiAcceleratedPersonWeeks: aiAccelerated,
    savingsPercent,
    breakdown: {
      discoveryWeeks,
      engineeringWeeks,
      testingCutoverWeeks,
    },
  }
}

export function generateTcoModel(workloadType: WorkloadType): TcoModel {
  switch (workloadType) {
    case 'database':
      return {
        estimatedAnnualSavingsPercent: 42,
        licenseOptimization: 'Eliminate proprietary database core license and annual maintenance fees by migrating to BigQuery serverless & AlloyDB.',
        opsEfficiencyGain: '65% reduction in DBA maintenance toil through Google-managed automatic vacuuming, high-availability replication, and backups.',
        riskMitigationSummary: 'Dual-run CDC replication eliminates cutover downtime; automated AST SQL translation minimizes schema refactoring defects.',
      }
    case 'kubernetes':
      return {
        estimatedAnnualSavingsPercent: 32,
        licenseOptimization: 'Eliminate third-party Ingress controller support licensing with Google-native GKE Gateway API & Cloud Load Balancing.',
        opsEfficiencyGain: '55% reduction in ingress routing management toil via multi-cluster GatewayClasses and automated certificate rotation.',
        riskMitigationSummary: 'Declarative HTTPRoute validation and canary traffic splitting guarantee zero-downtime service transition.',
      }
    case 'data-pipeline':
      return {
        estimatedAnnualSavingsPercent: 48,
        licenseOptimization: 'Retire legacy on-prem Cloudera/Hadoop software subscriptions and hardware refresh cycles in favor of Dataproc Serverless.',
        opsEfficiencyGain: '70% reduction in cluster management and capacity planning overhead through on-demand autoscaling serverless batches.',
        riskMitigationSummary: 'BigLake Iceberg table storage guarantees open format compliance with automated data verification checksums.',
      }
    case 'application':
    default:
      return {
        estimatedAnnualSavingsPercent: 38,
        licenseOptimization: 'Eliminate Windows Server / commercial application server licensing via Linux distroless containers on Cloud Run.',
        opsEfficiencyGain: '60% operational reduction by eliminating VM patching, OS maintenance, and static cluster sizing.',
        riskMitigationSummary: 'Automated Spring Boot 3 / .NET 8 recipes ensure zero syntax regressions with container test sandboxes.',
      }
  }
}

export function generateMarkdownReport(data: {
  workloadType: WorkloadType
  sourcePlatform: CloudSource
  sourceTechnology: string
  calibratedScore: number
  rawScore: number
  complexity: string
  dimensionScores: DimensionScores
  penalties: readonly PenaltyDeduction[]
  recommendedTarget: string
  recommendedBlueprints: readonly string[]
  recommendedSkills: readonly string[]
  actionPlan: readonly string[]
  riskFactors: readonly string[]
  wavePlan: readonly WavePlanItem[]
  effortEstimate: EffortEstimate
  tcoModel: TcoModel
}): string {
  const {
    workloadType,
    sourcePlatform,
    sourceTechnology,
    calibratedScore,
    complexity,
    dimensionScores,
    penalties,
    recommendedTarget,
    recommendedBlueprints,
    recommendedSkills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
  } = data

  const totalWaveWeeks = wavePlan.reduce((sum, w) => sum + w.durationWeeks, 0)

  return `# Executive Migration & Modernization Assessment
**Workload:** ${sourceTechnology} | **Source:** ${sourcePlatform.toUpperCase()} | **Type:** ${workloadType.toUpperCase()}
**Calibrated Feasibility Score:** ${calibratedScore.toFixed(1)} / 5.0 | **Complexity:** ${complexity}

---

## 1. Executive Summary & Recommended Target
- **Target Google Cloud Architecture:** ${recommendedTarget}
- **Recommended Blueprints:** ${recommendedBlueprints.join(', ')}
- **Mature Agent Skills:** ${recommendedSkills.map(s => `\`/${s}\``).join(', ')}

### Calibrated Scoring Rubric
- **Code Maturity (35%):** ${dimensionScores.codeMaturity.toFixed(1)} / 5.0
- **Market Fit (35%):** ${dimensionScores.marketFit.toFixed(1)} / 5.0
- **Architectural Innovation (30%):** ${dimensionScores.architecturalInnovation.toFixed(1)} / 5.0
${penalties.length > 0 ? `\n**Penalties Applied:**\n${penalties.map(p => `- ${p.reason} (-${p.deduction.toFixed(1)})`).join('\n')}\n` : ''}

---

## 2. 4-Wave Phased Migration Plan (${totalWaveWeeks} Weeks Total)
| Wave | Duration | Focus | Key Deliverables | Exit Criteria |
| :--- | :--- | :--- | :--- | :--- |
${wavePlan.map(w => `| **${w.wave}** | ${w.durationWeeks} wks | ${w.focus} | ${w.deliverables.join('; ')} | ${w.exitCriteria} |`).join('\n')}

---

## 3. Effort Modeling & AI Acceleration Impact
- **Baseline Migration Effort:** ${effortEstimate.baselinePersonWeeks} person-weeks
- **MMB AI-Accelerated Effort:** ${effortEstimate.aiAcceleratedPersonWeeks} person-weeks (**${effortEstimate.savingsPercent}% reduction**)
- **Effort Breakdown:**
  - Discovery & Architecture: **${effortEstimate.breakdown.discoveryWeeks} person-weeks**
  - Engineering & AST Transformation: **${effortEstimate.breakdown.engineeringWeeks} person-weeks**
  - Testing, Validation & Cutover: **${effortEstimate.breakdown.testingCutoverWeeks} person-weeks**

---

## 4. TCO & Financial Optimization
- **Estimated Annual Infrastructure & Ops Savings:** **${tcoModel.estimatedAnnualSavingsPercent}%**
- **License Optimization:** ${tcoModel.licenseOptimization}
- **Operational Efficiency:** ${tcoModel.opsEfficiencyGain}
- **Risk Mitigation:** ${tcoModel.riskMitigationSummary}

---

## 5. Action Plan & Risk Factors

### Action Plan
${actionPlan.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}

### Risk Factors & Guardrails
${riskFactors.map(rf => `- ⚠️ ${rf}`).join('\n')}

---
*Report generated by Google MMB Migration Center Workbench on DeepSeek Harness.*
`
}

function assessDatabaseWorkload(request: WorkloadAssessmentRequest): WorkloadAssessmentResult {
  const techLower = request.sourceTechnology.toLowerCase()
  const isOracle = techLower.includes('oracle')
  const isSqlServer = techLower.includes('sql server') || techLower.includes('mssql')
  const isPostgres = techLower.includes('postgres')

  const maturity = 3.5
  let marketFit = 4.5
  let innovation = 4.0
  let recommendedTarget = 'BigQuery + Datastream CDC'
  const blueprints = ['oracle-bigquery-mcp-agent', 'operational-ai-leap', 'mmb-datacloud']
  const skills = ['mmb-oracle-bigquery', 'mmb-alloydb-vector']

  if (isOracle) {
    recommendedTarget = 'BigQuery (Analytics & BQML) + AlloyDB for PostgreSQL (OLTP)'
    marketFit = 4.8
    innovation = 4.2
  } else if (isSqlServer) {
    recommendedTarget = 'Cloud SQL for SQL Server / AlloyDB with DMS Schema Conversion'
    marketFit = 3.8
    innovation = 3.0
  } else if (isPostgres) {
    recommendedTarget = 'AlloyDB with ScaNN pgvector & BigQuery Federation'
    marketFit = 4.2
    innovation = 4.5
  }

  const evalResult = evaluateRubric(maturity, marketFit, innovation, {
    isHollowSkeleton: false,
    isNotebookOnly: false,
    hasTests: request.hasTests,
  })

  const baseComplexity = isOracle ? 'Critical' : 'Moderate'
  const complexity = computeComplexity(baseComplexity, request.workloadScale)
  const { actionPlan, riskFactors } = augmentRisksAndPlans(
    request,
    [
      '1. Discovery & Schema Inspection: Run automated Oracle/DB dictionary assessment for unsupported data types & stored procedures.',
      '2. CDC Pipeline Provisioning: Deploy Datastream private connection & BigQuery dataset with merge deduplication.',
      '3. Backfill & Catch-up: Execute initial historical snapshot load via Cloud Storage staging bucket.',
      '4. Validation: Verify checksums, row counts, and data types between source and target tables.',
      '5. Cutover & In-Database AI: Switch application traffic and enable BigQuery ML ARIMA_PLUS / vector search.',
    ],
    [
      'PL/SQL proprietary stored procedures requiring automated SQL translation.',
      'Network bandwidth bottlenecks during initial multiterabyte data backfill.',
      'CDC latency spikes under high concurrent OLTP update volumes.',
    ],
  )

  const wavePlan = generateWavePlan('database', request.workloadScale, complexity)
  const effortEstimate = generateEffortEstimate(request.workloadScale, complexity)
  const tcoModel = generateTcoModel('database')
  const markdownReport = generateMarkdownReport({
    workloadType: 'database',
    sourcePlatform: request.sourcePlatform,
    sourceTechnology: request.sourceTechnology,
    calibratedScore: evalResult.calibratedScore,
    rawScore: evalResult.rawScore,
    complexity,
    dimensionScores: evalResult.dimensionScores,
    penalties: evalResult.penalties,
    recommendedTarget,
    recommendedBlueprints: blueprints,
    recommendedSkills: skills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
  })

  return {
    workloadType: 'database',
    sourcePlatform: request.sourcePlatform,
    sourceTechnology: request.sourceTechnology,
    rawScore: evalResult.rawScore,
    calibratedScore: evalResult.calibratedScore,
    dimensionScores: evalResult.dimensionScores,
    penaltiesApplied: evalResult.penalties,
    complexity,
    recommendedTarget,
    recommendedBlueprints: blueprints,
    recommendedSkills: skills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
    markdownReport,
  }
}

function assessKubernetesWorkload(request: WorkloadAssessmentRequest): WorkloadAssessmentResult {
  const evalResult = evaluateRubric(3.0, 4.5, 3.8, { hasTests: request.hasTests })
  const complexity = computeComplexity('Moderate', request.workloadScale)
  const blueprints = ['gke-migration-agent', 'k8s-hybrid-neg-controller']
  const skills = ['mmb-ingress2gateway']
  const recommendedTarget = 'GKE Gateway API (GatewayClass gke-l7-global-external-managed + HTTPRoute)'
  const { actionPlan, riskFactors } = augmentRisksAndPlans(
    request,
    [
      '1. Cluster Ingress Audit: Scan active networking.k8s.io/v1 Ingress manifests across all namespaces.',
      '2. Annotation Translation: Map cloud load balancing & cert-manager annotations to Gateway parameters.',
      '3. HTTPRoute Generation: Run AST translator to generate gateway.networking.k8s.io/v1 HTTPRoute resources.',
      '4. Staged Rollout: Deploy Gateway alongside existing Ingress using weighted DNS or canary routing.',
      '5. Decommission: Verify zero 5xx errors on HTTPRoute, then decommission legacy Ingress controller.',
    ],
    [
      'Custom ingress controller plugin annotations (NGINX snippets / lua scripts) require custom HTTPRoute filters.',
      'Multi-cluster service routing requires GKE Multi-Cluster Ingress / GatewayClass.',
    ],
  )

  const wavePlan = generateWavePlan('kubernetes', request.workloadScale, complexity)
  const effortEstimate = generateEffortEstimate(request.workloadScale, complexity)
  const tcoModel = generateTcoModel('kubernetes')
  const markdownReport = generateMarkdownReport({
    workloadType: 'kubernetes',
    sourcePlatform: request.sourcePlatform,
    sourceTechnology: request.sourceTechnology,
    calibratedScore: evalResult.calibratedScore,
    rawScore: evalResult.rawScore,
    complexity,
    dimensionScores: evalResult.dimensionScores,
    penalties: evalResult.penalties,
    recommendedTarget,
    recommendedBlueprints: blueprints,
    recommendedSkills: skills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
  })

  return {
    workloadType: 'kubernetes',
    sourcePlatform: request.sourcePlatform,
    sourceTechnology: request.sourceTechnology,
    rawScore: evalResult.rawScore,
    calibratedScore: evalResult.calibratedScore,
    dimensionScores: evalResult.dimensionScores,
    penaltiesApplied: evalResult.penalties,
    complexity,
    recommendedTarget,
    recommendedBlueprints: blueprints,
    recommendedSkills: skills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
    markdownReport,
  }
}

function assessDataPipelineWorkload(request: WorkloadAssessmentRequest): WorkloadAssessmentResult {
  const evalResult = evaluateRubric(3.2, 4.4, 3.6, { hasTests: request.hasTests })
  const complexity = computeComplexity('High', request.workloadScale)
  const blueprints = ['hadoop-to-lakehouse-migration-demo', 'legacy-detox-demo', 'dataflow-bigquery-change-data-capture']
  const skills = ['mmb-legacy-detox']
  const recommendedTarget = 'Dataproc Serverless + BigLake (Apache Iceberg) + Dataplex Governance'
  const { actionPlan, riskFactors } = augmentRisksAndPlans(
    request,
    [
      '1. HDFS & Hive Metastore Discovery: Catalog existing partitions, file formats (ORC/Parquet), and DAG workflows.',
      '2. Dual-Write Lakehouse Setup: Establish BigLake Iceberg tables over Cloud Storage buckets.',
      '3. PySpark Job Modernization: Refactor Hadoop HDFS path references to gs:// with Dataproc Serverless runtime.',
      '4. AST Verification: Validate Spark SQL queries against BigQuery dialect to avoid translation hallucinations.',
      '5. Orchestration Cutover: Transition scheduled Oozie/Airflow DAGs to Google Cloud Composer / Workflows.',
    ],
    [
      'UDFs (User-Defined Functions) written in Java/Scala requiring recompilation or Python rewrite.',
      'Small files problem on HDFS requiring compaction before Cloud Storage migration.',
    ],
  )

  const wavePlan = generateWavePlan('data-pipeline', request.workloadScale, complexity)
  const effortEstimate = generateEffortEstimate(request.workloadScale, complexity)
  const tcoModel = generateTcoModel('data-pipeline')
  const markdownReport = generateMarkdownReport({
    workloadType: 'data-pipeline',
    sourcePlatform: request.sourcePlatform,
    sourceTechnology: request.sourceTechnology,
    calibratedScore: evalResult.calibratedScore,
    rawScore: evalResult.rawScore,
    complexity,
    dimensionScores: evalResult.dimensionScores,
    penalties: evalResult.penalties,
    recommendedTarget,
    recommendedBlueprints: blueprints,
    recommendedSkills: skills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
  })

  return {
    workloadType: 'data-pipeline',
    sourcePlatform: request.sourcePlatform,
    sourceTechnology: request.sourceTechnology,
    rawScore: evalResult.rawScore,
    calibratedScore: evalResult.calibratedScore,
    dimensionScores: evalResult.dimensionScores,
    penaltiesApplied: evalResult.penalties,
    complexity,
    recommendedTarget,
    recommendedBlueprints: blueprints,
    recommendedSkills: skills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
    markdownReport,
  }
}

function assessApplicationWorkload(request: WorkloadAssessmentRequest): WorkloadAssessmentResult {
  const techLower = request.sourceTechnology.toLowerCase()
  const isJava = techLower.includes('java') || techLower.includes('spring')
  const isDotnet = techLower.includes('dotnet') || techLower.includes('.net') || techLower.includes('c#')

  const evalResult = evaluateRubric(2.8, 4.3, 3.2, { hasTests: request.hasTests })
  const complexity = computeComplexity('Moderate', request.workloadScale)
  const blueprints = isJava
    ? ['java-modernization-demo', 'build-with-gemini-demo']
    : isDotnet
      ? ['dotnet-modernization-demo']
      : ['java-modernization-demo', 'dotnet-modernization-demo']
  const skills = ['mmb-app-modernization']
  const recommendedTarget = 'Cloud Run (Serverless Containers) + Artifact Registry + Cloud SQL'
  const { actionPlan, riskFactors } = augmentRisksAndPlans(
    request,
    [
      '1. Codebase Scan: Parse dependencies (pom.xml / *.csproj) and flag deprecated framework APIs.',
      '2. Modernization Recipe: Apply automated AST refactoring (Spring Boot 2->3 or .NET Core 8 Linux containerization).',
      '3. Dockerfile Generation: Generate multi-stage distroless container builds optimized for Cloud Run.',
      '4. Build & Test Verification: Run hermetic test verification (mvn test / dotnet test) to guarantee zero regression.',
      '5. Cloud Run Deployment: Deploy container with IAM service account and Cloud SQL Auth Proxy.',
    ],
    [
      'Hardcoded filesystem paths or Windows registry dependencies in legacy .NET/Java apps.',
      'In-memory session state requiring externalization to Memorystore for Redis.',
    ],
  )

  const wavePlan = generateWavePlan('application', request.workloadScale, complexity)
  const effortEstimate = generateEffortEstimate(request.workloadScale, complexity)
  const tcoModel = generateTcoModel('application')
  const markdownReport = generateMarkdownReport({
    workloadType: 'application',
    sourcePlatform: request.sourcePlatform,
    sourceTechnology: request.sourceTechnology,
    calibratedScore: evalResult.calibratedScore,
    rawScore: evalResult.rawScore,
    complexity,
    dimensionScores: evalResult.dimensionScores,
    penalties: evalResult.penalties,
    recommendedTarget,
    recommendedBlueprints: blueprints,
    recommendedSkills: skills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
  })

  return {
    workloadType: 'application',
    sourcePlatform: request.sourcePlatform,
    sourceTechnology: request.sourceTechnology,
    rawScore: evalResult.rawScore,
    calibratedScore: evalResult.calibratedScore,
    dimensionScores: evalResult.dimensionScores,
    penaltiesApplied: evalResult.penalties,
    complexity,
    recommendedTarget,
    recommendedBlueprints: blueprints,
    recommendedSkills: skills,
    actionPlan,
    riskFactors,
    wavePlan,
    effortEstimate,
    tcoModel,
    markdownReport,
  }
}
