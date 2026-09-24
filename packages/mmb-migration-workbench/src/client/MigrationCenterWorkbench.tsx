/**
 * Migration Center Workbench - Full Interactive Modal UI.
 * Provides 4 streamlined practitioner tabs: Curated Blueprints (12),
 * Workload Assessment & Wave Plan, Modernization Recipes (6), and Practitioner Skills (5).
 *
 * @module @deepseek-ai/dsh-mmb-migration-workbench/client/MigrationCenterWorkbench
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { CURATED_PRACTITIONER_BLUEPRINTS, type CuratedBlueprint } from '../catalog-data.ts'
import { assessWorkload } from '../assessment-engine.ts'
import { translateIngressToGatewayApi } from '../ingress-translator.ts'
import { MODERNIZATION_RECIPES, runModernizationRecipe, type ExtendedModernizationRecipe } from '../recipes.ts'
import { PRACTITIONER_SKILLS, type PractitionerSkillInfo } from '../skills.ts'
import type { CloudSource, RecipeRunResult, WorkloadAssessmentResult, WorkloadType } from '../types.ts'
import type { WorkspaceScanResult } from '../workspace-scanner.ts'
import { MigrationCenterIcon } from './MigrationCenterIcon.tsx'
import { sendPromptToHarnessComposer, showNotificationToast, workbenchStore } from './workbench-state.ts'

export type MigrationCenterWorkbenchProps =
  PropsRuntime<'shell.overlay'> & PropsLocale<'mmb'>

const SAMPLE_INGRESS_YAML = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: store-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: "gke-external"
    networking.gke.io/v1.Ingress/load-balancer-type: "External"
spec:
  tls:
    - hosts:
        - store.example.com
      secretName: store-tls-secret
  rules:
    - host: store.example.com
      http:
        paths:
          - path: /api/v1/orders
            pathType: Prefix
            backend:
              service:
                name: orders-service
                port:
                  number: 8080
          - path: /api/v1/catalog
            pathType: Prefix
            backend:
              service:
                name: catalog-service
                port:
                  number: 8080
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-web
                port:
                  number: 80`

const PRESET_CANARY_INGRESS = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: store-canary-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: "nginx"
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "20"
spec:
  tls:
    - hosts:
        - api.store.example.com
      secretName: store-tls-cert
  rules:
    - host: api.store.example.com
      http:
        paths:
          - path: /v2/checkout
            pathType: Prefix
            backend:
              service:
                name: checkout-v2-canary
                port:
                  number: 8080`

export function MigrationCenterWorkbench({ t }: MigrationCenterWorkbenchProps): ReactElement | null {
  const state = useSyncExternalStore(
    workbenchStore.subscribe,
    workbenchStore.getSnapshot,
  )

  // Local state for assessment tab
  const [assessType, setAssessType] = useState<WorkloadType>('database')
  const [assessSource, setAssessSource] = useState<CloudSource>('aws')
  const [assessTech, setAssessTech] = useState('Oracle 19c RAC')
  const [assessScale, setAssessScale] = useState<'small' | 'medium' | 'large' | 'enterprise'>('large')
  const [hasTests, setHasTests] = useState<boolean>(true)
  const [assessResult, setAssessResult] = useState<WorkloadAssessmentResult | null>(() =>
    assessWorkload({ workloadType: 'database', sourcePlatform: 'aws', sourceTechnology: 'Oracle 19c RAC', workloadScale: 'large' }),
  )

  // Local state for recipes tab
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('java-spring-boot-3')
  const [recipeResult, setRecipeResult] = useState<RecipeRunResult | null>(() => runModernizationRecipe('java-spring-boot-3', true))
  const [showIngressTranslator, setShowIngressTranslator] = useState(false)

  // Ingress translator state (embedded inside k8s recipe)
  const [ingressInput, setIngressInput] = useState(SAMPLE_INGRESS_YAML)
  const [translatedOutput, setTranslatedOutput] = useState(() => translateIngressToGatewayApi({ manifest: SAMPLE_INGRESS_YAML }))
  const [copiedIngress, setCopiedIngress] = useState(false)

  // Curated Blueprints filter
  const [domainFilter, setDomainFilter] = useState<'all' | 'database' | 'app' | 'data' | 'cloud'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Workspace scan state
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<WorkspaceScanResult | null>(null)

  // Synchronize preloads from state
  useEffect(() => {
    if (state.assessmentPreload) {
      if (state.assessmentPreload.workloadType) setAssessType(state.assessmentPreload.workloadType)
      if (state.assessmentPreload.sourcePlatform) setAssessSource(state.assessmentPreload.sourcePlatform)
      if (state.assessmentPreload.sourceTechnology) setAssessTech(state.assessmentPreload.sourceTechnology)
      if (state.assessmentPreload.workloadScale) setAssessScale(state.assessmentPreload.workloadScale)
      if (state.assessmentPreload.hasTests !== undefined) setHasTests(state.assessmentPreload.hasTests)
      const res = assessWorkload({
        workloadType: state.assessmentPreload.workloadType ?? assessType,
        sourcePlatform: state.assessmentPreload.sourcePlatform ?? assessSource,
        sourceTechnology: state.assessmentPreload.sourceTechnology ?? assessTech,
        workloadScale: state.assessmentPreload.workloadScale ?? assessScale,
        hasTests: state.assessmentPreload.hasTests ?? hasTests,
      })
      setAssessResult(res)
    }
  }, [state.assessmentPreload])

  useEffect(() => {
    if (state.ingressPreload) {
      setIngressInput(state.ingressPreload)
      setSelectedRecipeId('k8s-ingress-to-gateway-api')
      setShowIngressTranslator(true)
      const res = translateIngressToGatewayApi({ manifest: state.ingressPreload })
      setTranslatedOutput(res)
    }
  }, [state.ingressPreload])

  useEffect(() => {
    if (state.searchQuery) {
      setSearchQuery(state.searchQuery)
    }
  }, [state.searchQuery])

  // Filter 12 curated blueprints
  const filteredBlueprints = useMemo(() => {
    let list = [...CURATED_PRACTITIONER_BLUEPRINTS]
    if (domainFilter !== 'all') {
      list = list.filter(b => b.domain === domainFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q) ||
        b.sourceStack.some(s => s.toLowerCase().includes(q)) ||
        b.targetStack.some(s => s.toLowerCase().includes(q)) ||
        b.deliverables.some(d => d.toLowerCase().includes(q)),
      )
    }
    return list
  }, [domainFilter, searchQuery])

  if (!state.isOpen) return null

  const handleRunAssessment = (): void => {
    const result = assessWorkload({
      workloadType: assessType,
      sourcePlatform: assessSource,
      sourceTechnology: assessTech,
      workloadScale: assessScale,
      hasTests,
    })
    setAssessResult(result)
  }

  const handleScanWorkspace = async (): Promise<void> => {
    setIsScanning(true)
    try {
      const res = await fetch('/api/mmb/scan-workspace')
      if (res.ok) {
        const data: WorkspaceScanResult = await res.json()
        setScanResult(data)
        setAssessTech(data.detectedSourceTech)
        const mappedType: WorkloadType =
          data.detectedWorkloadType === 'app-modernization' ? 'application' : data.detectedWorkloadType
        setAssessType(mappedType)
        const updated = assessWorkload({
          workloadType: mappedType,
          sourcePlatform: assessSource,
          sourceTechnology: data.detectedSourceTech,
          workloadScale: assessScale,
          hasTests,
        })
        setAssessResult(updated)
        showNotificationToast(`✓ Auto-scanned ${data.totalFilesScanned} workspace files: detected ${data.detectedSourceTech}`)
      } else {
        showNotificationToast('⚠️ Scan endpoint returned status ' + res.status)
      }
    } catch (_err) {
      showNotificationToast('⚠️ Workspace scan error; check server connectivity.')
    } finally {
      setIsScanning(false)
    }
  }

  const handleSelectRecipe = (id: string): void => {
    setSelectedRecipeId(id)
    const res = runModernizationRecipe(id, true)
    setRecipeResult(res)
    if (id === 'k8s-ingress-to-gateway-api') {
      setShowIngressTranslator(true)
    }
  }

  const handleTranslateIngress = (): void => {
    const res = translateIngressToGatewayApi({ manifest: ingressInput })
    setTranslatedOutput(res)
  }

  const handleCopyTranslated = (): void => {
    navigator.clipboard?.writeText(translatedOutput.combinedYaml)
    setCopiedIngress(true)
    showNotificationToast('✓ Copied Gateway API YAML to clipboard!')
    setTimeout(() => { setCopiedIngress(false) }, 2000)
  }

  const handleDownloadGatewayYaml = (): void => {
    const blob = new Blob([translatedOutput.combinedYaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gke-gateway-api.yaml'
    a.click()
    URL.revokeObjectURL(url)
    showNotificationToast('✓ Downloaded gke-gateway-api.yaml')
  }

  const handleCopyReport = (): void => {
    if (!assessResult?.markdownReport) return
    navigator.clipboard?.writeText(assessResult.markdownReport)
    showNotificationToast('✓ Executive Assessment Markdown Report copied to clipboard!')
  }

  const handleExportReport = (): void => {
    if (!assessResult?.markdownReport) return
    const blob = new Blob([assessResult.markdownReport], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mmb-assessment-${assessResult.sourceTechnology.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
    showNotificationToast('✓ Downloaded assessment report (.md)')
  }

  const activeRecipe = MODERNIZATION_RECIPES.find(r => r.id === selectedRecipeId) as ExtendedModernizationRecipe | undefined

  return (
    <div style={styles.overlayBackdrop}>
      <div style={styles.modalContainer}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitleRow}>
            <div style={styles.headerIconWrap}>
              <MigrationCenterIcon size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={styles.headerTitle}>{t('workbench.title')}</h2>
                <span style={styles.studioBadge}>MMB Studio</span>
              </div>
              <p style={styles.headerSubtitle}>{t('workbench.subtitle')}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleScanWorkspace}
              disabled={isScanning}
              style={styles.scanButtonHeader}
              title="Automatically scan active workspace files and detect workloads"
            >
              {isScanning ? '⏳ Scanning...' : '🔍 Auto-Scan Workspace'}
            </button>
            <button
              type="button"
              onClick={() => { workbenchStore.close() }}
              style={styles.closeButton}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 4 Streamlined Tabs */}
        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('portfolio') }}
            style={state.activeTab === 'portfolio' ? styles.tabActive : styles.tab}
          >
            🏛️ Curated Blueprints (12)
          </button>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('assessment') }}
            style={state.activeTab === 'assessment' ? styles.tabActive : styles.tab}
          >
            📐 Workload Assessment &amp; Wave Plan
          </button>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('recipes') }}
            style={state.activeTab === 'recipes' ? styles.tabActive : styles.tab}
          >
            🛠️ Modernization Recipes (6)
          </button>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('skills') }}
            style={state.activeTab === 'skills' ? styles.tabActive : styles.tab}
          >
            ⚡ Practitioner Skills (5)
          </button>
        </div>

        {/* Tab Content */}
        <div style={styles.contentArea}>
          {/* TAB 1: CURATED BLUEPRINTS (12) */}
          {state.activeTab === 'portfolio' && (
            <div>
              {/* Filter & Search Bar */}
              <div style={styles.filterRow}>
                <div style={styles.filterButtonGroup}>
                  {(
                    [
                      { id: 'all', label: 'All Blueprints (12)' },
                      { id: 'database', label: 'Database (3)' },
                      { id: 'app', label: 'App Modernization (3)' },
                      { id: 'data', label: 'Data & Lakehouse (2)' },
                      { id: 'cloud', label: 'Cloud Replatform (4)' },
                    ] as const
                  ).map(filter => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => { setDomainFilter(filter.id) }}
                      style={domainFilter === filter.id ? styles.filterBtnActive : styles.filterBtn}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder={t('filter.search')}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value) }}
                  style={styles.searchInput}
                />
              </div>

              {/* Blueprint Grid */}
              <div style={styles.blueprintGrid}>
                {filteredBlueprints.map((blueprint: CuratedBlueprint) => (
                  <div key={blueprint.id} style={styles.blueprintCard}>
                    <div style={styles.blueprintCardHeader}>
                      <div>
                        <span style={styles.blueprintCardTitle}>{blueprint.title}</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                          <span style={styles.domainTag}>{blueprint.domainLabel}</span>
                          <span style={styles.scoreBadge}>★ {blueprint.score.toFixed(1)} Production-Ready</span>
                        </div>
                      </div>
                    </div>

                    <p style={styles.blueprintDesc}>{blueprint.description}</p>

                    {/* Source -> Target Stack Flow */}
                    <div style={styles.stackFlowBox}>
                      <div style={styles.stackFlowRow}>
                        <span style={styles.stackLabel}>Source:</span>
                        <div style={styles.stackChipsWrap}>
                          {blueprint.sourceStack.map(s => (
                            <span key={s} style={styles.sourceChip}>{s}</span>
                          ))}
                        </div>
                      </div>
                      <div style={styles.stackFlowRow}>
                        <span style={{ ...styles.stackLabel, color: '#81c995' }}>Target GCP:</span>
                        <div style={styles.stackChipsWrap}>
                          {blueprint.targetStack.map(t => (
                            <span key={t} style={styles.targetChip}>{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Deliverables */}
                    <div style={styles.deliverablesBox}>
                      <span style={styles.deliverablesTitle}>Practitioner Deliverables:</span>
                      <ul style={styles.deliverablesList}>
                        {blueprint.deliverables.map(d => (
                          <li key={d} style={styles.deliverableItem}>✓ {d}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Action Bar */}
                    <div style={styles.cardFooter}>
                      <button
                        type="button"
                        onClick={() => {
                          sendPromptToHarnessComposer(
                            `Execute enterprise migration for blueprint "${blueprint.title}".\nSource Stack: ${blueprint.sourceStack.join(', ')}\nTarget GCP Architecture: ${blueprint.targetStack.join(', ')}\nDeliverables to generate:\n${blueprint.deliverables.map(d => `- ${d}`).join('\n')}\nRecommended Skills: ${blueprint.recommendedSkills.map(s => `/${s}`).join(', ')}.\nFormulate the technical execution plan, verify prerequisites, and begin Wave 0 discovery.`,
                            { autoSubmit: true },
                          )
                        }}
                        style={styles.cardPrimaryBtn}
                        title="Immediately trigger execution with active subagent"
                      >
                        🚀 Run Blueprint with Agent
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sendPromptToHarnessComposer(
                            `Review architecture and migration strategy for blueprint "${blueprint.title}".\nSource: ${blueprint.sourceStack.join(', ')} -> Target: ${blueprint.targetStack.join(', ')}.\nDeliverables: ${blueprint.deliverables.join('; ')}.\nProvide technical review and readiness checklist.`,
                            { autoSubmit: false },
                          )
                        }}
                        style={styles.cardSecondaryBtn}
                        title="Draft a prompt in chat discussing this blueprint"
                      >
                        💬 Send to Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssessTech(blueprint.sourceStack[0] ?? blueprint.title)
                          let nextType: WorkloadType = 'application'
                          if (blueprint.domain === 'database') nextType = 'database'
                          else if (blueprint.domain === 'data') nextType = 'data-pipeline'
                          else if (blueprint.domain === 'cloud' && blueprint.id.includes('ingress')) nextType = 'kubernetes'
                          setAssessType(nextType)
                          const updated = assessWorkload({
                            workloadType: nextType,
                            sourcePlatform: assessSource,
                            sourceTechnology: blueprint.sourceStack[0] ?? blueprint.title,
                            workloadScale: assessScale,
                            hasTests,
                          })
                          setAssessResult(updated)
                          workbenchStore.setActiveTab('assessment')
                        }}
                        style={styles.cardScopeBtn}
                        title="Open in Workload Assessment"
                      >
                        📐 Scope &amp; Assess →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: WORKLOAD ASSESSMENT & WAVE PLAN */}
          {state.activeTab === 'assessment' && (
            <div style={styles.splitLayout}>
              {/* Left Column: Form & Scan Controls */}
              <div style={styles.formPanel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={styles.sectionHeading}>🎯 {t('assess.title')}</h3>
                  <button
                    type="button"
                    onClick={handleScanWorkspace}
                    disabled={isScanning}
                    style={styles.scanInlineBtn}
                  >
                    {isScanning ? '⏳ Scanning...' : '🔍 Auto-Scan Workspace'}
                  </button>
                </div>
                <p style={styles.sectionDesc}>
                  Evaluates target customer architecture against 2026 enterprise compete landscape
                  (Oracle exit, Zero-ETL AI, Gateway API, .NET/Java to Cloud Run).
                </p>

                {/* Scan Banner if scanned */}
                {scanResult && (
                  <div style={styles.scanNoticeBox}>
                    <div style={{ fontWeight: 600, color: '#81c995', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>✓ Detected: {scanResult.detectedSourceTech}</span>
                      <span>({scanResult.totalFilesScanned} files)</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#9aa0a6' }}>
                      Found {scanResult.markers.length} migration markers in workspace.
                    </div>
                  </div>
                )}

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>{t('assess.workloadType')}</label>
                  <select
                    value={assessType}
                    onChange={(e) => { setAssessType(e.target.value as WorkloadType) }}
                    style={styles.selectInput}
                  >
                    <option value="database">Database (Oracle, SQL Server, Postgres)</option>
                    <option value="kubernetes">Kubernetes (Ingress, Microservices, Gateway API)</option>
                    <option value="data-pipeline">Data Lake &amp; Pipeline (Hadoop, Spark, Iceberg)</option>
                    <option value="application">Application Monolith (Java Spring Boot, .NET Framework)</option>
                  </select>
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>{t('assess.sourcePlatform')}</label>
                  <select
                    value={assessSource}
                    onChange={(e) => { setAssessSource(e.target.value as CloudSource) }}
                    style={styles.selectInput}
                  >
                    <option value="aws">Amazon Web Services (AWS)</option>
                    <option value="azure">Microsoft Azure</option>
                    <option value="on-prem">On-Premises Data Center</option>
                    <option value="gcp">Google Cloud Platform (In-place Modernization)</option>
                  </select>
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>{t('assess.sourceTech')}</label>
                  <input
                    type="text"
                    value={assessTech}
                    onChange={(e) => { setAssessTech(e.target.value) }}
                    placeholder="e.g. Oracle 19c RAC, Spring Boot 2.7, Hadoop Spark, .NET 4.8"
                    style={styles.textInput}
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>Workload Scale</label>
                  <select
                    value={assessScale}
                    onChange={(e) => { setAssessScale(e.target.value as 'small' | 'medium' | 'large' | 'enterprise') }}
                    style={styles.selectInput}
                  >
                    <option value="small">Small (&lt; 500 GB, &lt; 100 QPS)</option>
                    <option value="medium">Medium (500 GB - 5 TB, &lt; 1,000 QPS)</option>
                    <option value="large">Large (5 TB - 50 TB, &lt; 10,000 QPS)</option>
                    <option value="enterprise">Enterprise (&gt; 50 TB, High Concurrency)</option>
                  </select>
                </div>

                <div style={{ ...styles.fieldGroup, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="hasTestsCheck"
                    checked={hasTests}
                    onChange={(e) => { setHasTests(e.target.checked) }}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="hasTestsCheck" style={{ fontSize: '12px', color: '#bdc1c6', cursor: 'pointer' }}>
                    Workload has automated regression tests
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleRunAssessment}
                  style={styles.primaryButton}
                >
                  🚀 {t('assess.run')}
                </button>
              </div>

              {/* Right Column: Assessment Output, Wave Plan, Effort, and TCO */}
              <div style={styles.resultPanel}>
                {assessResult ? (
                  <div>
                    {/* Header with Export & Agent Actions */}
                    <div style={styles.resultHeader}>
                      <div>
                        <span style={styles.resultTitle}>{assessResult.sourceTechnology}</span>
                        <span style={styles.resultSourceTag}>Source: {assessResult.sourcePlatform.toUpperCase()} • Type: {assessResult.workloadType.toUpperCase()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            sendPromptToHarnessComposer(
                              `Execute the 4-Wave Migration Plan for ${assessResult.sourceTechnology} (${assessResult.sourcePlatform.toUpperCase()}) -> ${assessResult.recommendedTarget}.\nBegin with Wave 0: Discovery & Landing Zone.\nRecommended Skills: ${assessResult.recommendedSkills.map(s => `/${s}`).join(', ')}.\nAction Plan:\n${assessResult.actionPlan.join('\n')}`,
                              { autoSubmit: true },
                            )
                          }}
                          style={styles.agentExecuteBtn}
                          title="Dispatch full execution prompt to agent in session composer"
                        >
                          🚀 Execute Plan with Agent
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyReport}
                          style={styles.reportActionBtn}
                          title="Copy full executive Markdown report"
                        >
                          📋 Copy Report
                        </button>
                        <button
                          type="button"
                          onClick={handleExportReport}
                          style={styles.reportActionBtn}
                          title="Export report as .md file"
                        >
                          📥 Export .md
                        </button>
                        <div style={styles.scoreGaugeBox}>
                          <div style={styles.scoreGaugeValue}>
                            {assessResult.calibratedScore.toFixed(1)}
                          </div>
                          <div style={styles.scoreGaugeLabel}>Feasibility / 5.0</div>
                        </div>
                      </div>
                    </div>

                    {/* Dimension Strip */}
                    <div style={styles.dimensionStrip}>
                      <div style={styles.dimensionItem}>
                        <span style={styles.dimensionVal}>{assessResult.dimensionScores.codeMaturity.toFixed(1)}</span>
                        <span style={styles.dimensionLbl}>Code Maturity (35%)</span>
                      </div>
                      <div style={styles.dimensionItem}>
                        <span style={styles.dimensionVal}>{assessResult.dimensionScores.marketFit.toFixed(1)}</span>
                        <span style={styles.dimensionLbl}>Market Fit (35%)</span>
                      </div>
                      <div style={styles.dimensionItem}>
                        <span style={styles.dimensionVal}>{assessResult.dimensionScores.architecturalInnovation.toFixed(1)}</span>
                        <span style={styles.dimensionLbl}>Innovation (30%)</span>
                      </div>
                      <div style={styles.dimensionItem}>
                        <span style={{ ...styles.dimensionVal, color: '#f28b82' }}>{assessResult.complexity}</span>
                        <span style={styles.dimensionLbl}>Complexity</span>
                      </div>
                    </div>

                    {/* Target GCP Service */}
                    <div style={styles.resultCard}>
                      <h4 style={styles.resultCardTitle}>🎯 {t('assess.target')}</h4>
                      <p style={styles.resultTargetText}>{assessResult.recommendedTarget}</p>
                    </div>

                    {/* Wave Plan Timeline Card */}
                    <div style={styles.resultCard}>
                      <h4 style={styles.resultCardTitle}>🌊 4-Wave Phased Migration Timeline</h4>
                      <div style={styles.waveTimelineContainer}>
                        {assessResult.wavePlan?.map((wave, idx) => (
                          <div key={wave.wave} style={styles.waveItemBox}>
                            <div style={styles.waveHeaderRow}>
                              <span style={styles.waveBadge}>WAVE {idx}</span>
                              <span style={styles.waveName}>{wave.wave}</span>
                              <span style={styles.waveDuration}>{wave.durationWeeks} Weeks</span>
                            </div>
                            <p style={styles.waveFocusText}><strong>Focus:</strong> {wave.focus}</p>
                            <div style={styles.waveDeliverablesList}>
                              <strong>Key Deliverables:</strong>
                              <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
                                {wave.deliverables.map(d => (
                                  <li key={d} style={{ fontSize: '11px', color: '#bdc1c6', marginBottom: '2px' }}>{d}</li>
                                ))}
                              </ul>
                            </div>
                            <div style={styles.waveExitCriteria}>
                              <span style={{ color: '#81c995', fontWeight: 600 }}>Exit Criteria:</span> {wave.exitCriteria}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Effort & AI Acceleration Model */}
                    {assessResult.effortEstimate && (
                      <div style={styles.resultCard}>
                        <h4 style={styles.resultCardTitle}>⚡ Effort &amp; AI Acceleration Model</h4>
                        <div style={styles.effortMetricGrid}>
                          <div style={styles.effortMetricCard}>
                            <div style={styles.effortMetricNum}>{assessResult.effortEstimate.baselinePersonWeeks} wks</div>
                            <div style={styles.effortMetricLbl}>Baseline Manual Effort</div>
                          </div>
                          <div style={{ ...styles.effortMetricCard, border: '1px solid rgba(52,168,83,0.3)', background: 'rgba(52,168,83,0.08)' }}>
                            <div style={{ ...styles.effortMetricNum, color: '#81c995' }}>{assessResult.effortEstimate.aiAcceleratedPersonWeeks} wks</div>
                            <div style={styles.effortMetricLbl}>MMB AI Accelerated</div>
                          </div>
                          <div style={{ ...styles.effortMetricCard, border: '1px solid rgba(66,133,244,0.3)', background: 'rgba(66,133,244,0.08)' }}>
                            <div style={{ ...styles.effortMetricNum, color: '#8ab4f8' }}>-{assessResult.effortEstimate.savingsPercent}%</div>
                            <div style={styles.effortMetricLbl}>Effort Reduction</div>
                          </div>
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#bdc1c6', display: 'flex', gap: '16px' }}>
                          <span>• Discovery: <strong>{assessResult.effortEstimate.breakdown.discoveryWeeks} wks</strong></span>
                          <span>• Engineering: <strong>{assessResult.effortEstimate.breakdown.engineeringWeeks} wks</strong></span>
                          <span>• Testing &amp; Cutover: <strong>{assessResult.effortEstimate.breakdown.testingCutoverWeeks} wks</strong></span>
                        </div>
                      </div>
                    )}

                    {/* TCO & Financial Optimization */}
                    {assessResult.tcoModel && (
                      <div style={styles.resultCard}>
                        <h4 style={styles.resultCardTitle}>💰 TCO &amp; Financial Optimization</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '24px', fontWeight: 800, color: '#81c995' }}>
                            {assessResult.tcoModel.estimatedAnnualSavingsPercent}%
                          </span>
                          <span style={{ fontSize: '12px', color: '#9aa0a6' }}>Estimated Annual Cost &amp; Operations Reduction</span>
                        </div>
                        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#e8eaed' }}>
                          <strong style={{ color: '#8ab4f8' }}>License Optimization:</strong> {assessResult.tcoModel.licenseOptimization}
                        </p>
                        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#81c995' }}>
                          <strong style={{ color: '#81c995' }}>Ops Efficiency:</strong> {assessResult.tcoModel.opsEfficiencyGain}
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#e8eaed' }}>
                          <strong style={{ color: '#fdd663' }}>Risk Mitigation:</strong> {assessResult.tcoModel.riskMitigationSummary}
                        </p>
                      </div>
                    )}

                    {/* Action Plan */}
                    <div style={styles.resultCard}>
                      <h4 style={styles.resultCardTitle}>📋 {t('assess.actionPlan')}</h4>
                      <ol style={styles.actionPlanList}>
                        {assessResult.actionPlan.map((step: string) => (
                          <li key={step} style={styles.actionPlanItem}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    {/* Risks */}
                    <div style={styles.resultCard}>
                      <h4 style={styles.resultCardTitle}>⚠️ {t('assess.risks')}</h4>
                      <ul style={styles.riskList}>
                        {assessResult.riskFactors.map((rf: string) => (
                          <li key={rf} style={styles.riskItem}>{rf}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: 'var(--dsw-text-secondary, #9aa0a6)' }}>Run an assessment or scan your workspace to view recommendations.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MODERNIZATION RECIPES (6) WITH DIFF PREVIEWS & EMBEDDED TRANSLATOR */}
          {state.activeTab === 'recipes' && (
            <div style={styles.splitLayout}>
              {/* Left Column: Recipes List */}
              <div style={styles.formPanel}>
                <h3 style={styles.sectionHeading}>🛠️ Modernization Recipes (6)</h3>
                <p style={styles.sectionDesc}>
                  Lossless AST refactoring recipes inspired by OpenRewrite and Moderne for enterprise codebases.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {MODERNIZATION_RECIPES.map(recipe => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => { handleSelectRecipe(recipe.id) }}
                      style={selectedRecipeId === recipe.id ? styles.recipeSelectBtnActive : styles.recipeSelectBtn}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                        {recipe.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--dsw-text-secondary, #9aa0a6)' }}>
                        Category: {recipe.category.toUpperCase()} • Verified AST
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Column: Execution details, Before/After Diff, and Quick Ingress Translator */}
              <div style={styles.resultPanel}>
                {activeRecipe && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <h3 style={{ ...styles.sectionHeading, margin: 0 }}>{activeRecipe.title}</h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            sendPromptToHarnessComposer(
                              `Execute Modernization Recipe "${activeRecipe.title}" (${activeRecipe.id}).\nTarget Files: ${activeRecipe.targetFiles}\nSource Pattern: ${activeRecipe.sourcePattern}\nTarget Pattern: ${activeRecipe.targetPattern}\nVerification Command: \`${activeRecipe.verificationCommand}\`\nExecute the code refactoring on target files, verify compilation, and report all modified lines.`,
                              { autoSubmit: true },
                            )
                          }}
                          style={styles.agentExecuteBtn}
                          title="Instruct agent to execute this recipe on workspace files"
                        >
                          🚀 Execute Recipe in Chat
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            sendPromptToHarnessComposer(
                              `Review the refactoring spec for recipe "${activeRecipe.title}".\nTarget Files: ${activeRecipe.targetFiles}\nVerification Command: \`${activeRecipe.verificationCommand}\``,
                              { autoSubmit: false },
                            )
                          }}
                          style={styles.cardSecondaryBtn}
                        >
                          💬 Send to Chat
                        </button>
                      </div>
                    </div>
                    <p style={{ ...styles.sectionDesc, marginBottom: '12px' }}>{activeRecipe.description}</p>

                    {/* Target Files & Patterns */}
                    <div style={styles.targetFilesBox}>
                      <span style={{ color: '#8ab4f8', fontWeight: 600 }}>Target Files &amp; AST Scope:</span>{' '}
                      <code style={{ color: '#ffffff' }}>{activeRecipe.targetFiles}</code>
                    </div>

                    {/* Before -> After Diff Preview */}
                    <div style={styles.diffContainer}>
                      <div style={styles.diffPane}>
                        <div style={styles.diffHeaderBefore}>🔴 Before (Legacy Pattern)</div>
                        <pre style={styles.diffCode}>{activeRecipe.beforeCode}</pre>
                      </div>
                      <div style={styles.diffPane}>
                        <div style={styles.diffHeaderAfter}>🟢 After (Modernized Target)</div>
                        <pre style={styles.diffCode}>{activeRecipe.afterCode}</pre>
                      </div>
                    </div>

                    {/* Embedded Ingress Translator Expander (Folded into Recipe 6) */}
                    {activeRecipe.id === 'k8s-ingress-to-gateway-api' && (
                      <div style={styles.ingressExpanderCard}>
                        <div
                          style={styles.ingressExpanderHeader}
                          onClick={() => { setShowIngressTranslator(!showIngressTranslator) }}
                        >
                          <span style={{ fontWeight: 600, color: '#81c995', fontSize: '13px' }}>
                            ⚡ Interactive Ingress-to-Gateway YAML Translator {showIngressTranslator ? '▼' : '▶'}
                          </span>
                          <span style={{ fontSize: '11px', color: '#9aa0a6' }}>Click to toggle AST studio</span>
                        </div>

                        {showIngressTranslator && (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setIngressInput(SAMPLE_INGRESS_YAML)
                                  const res = translateIngressToGatewayApi({ manifest: SAMPLE_INGRESS_YAML })
                                  setTranslatedOutput(res)
                                }}
                                style={styles.secondaryButton}
                              >
                                📄 Standard Sample
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIngressInput(PRESET_CANARY_INGRESS)
                                  const res = translateIngressToGatewayApi({ manifest: PRESET_CANARY_INGRESS })
                                  setTranslatedOutput(res)
                                }}
                                style={styles.secondaryButton}
                              >
                                🚦 Canary + TLS
                              </button>
                              <button
                                type="button"
                                onClick={handleTranslateIngress}
                                style={styles.primaryButtonInline}
                              >
                                ⚡ Translate to Gateway API
                              </button>
                            </div>

                            <div style={styles.translatorPanesMini}>
                              <div style={styles.paneHalf}>
                                <div style={styles.paneHeader}>Source Ingress Manifest</div>
                                <textarea
                                  value={ingressInput}
                                  onChange={(e) => { setIngressInput(e.target.value) }}
                                  style={styles.codeTextareaMini}
                                  spellCheck={false}
                                />
                              </div>
                              <div style={styles.paneHalf}>
                                <div style={styles.paneHeaderWithAction}>
                                  <span>GKE Gateway API Output</span>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      type="button"
                                      onClick={handleCopyTranslated}
                                      style={styles.copyButton}
                                    >
                                      {copiedIngress ? '✓ Copied' : '📋 Copy'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleDownloadGatewayYaml}
                                      style={styles.copyButton}
                                    >
                                      📥 Download
                                    </button>
                                  </div>
                                </div>
                                <textarea
                                  readOnly
                                  value={translatedOutput.combinedYaml}
                                  style={{ ...styles.codeTextareaMini, background: 'rgba(0,0,0,0.4)', color: '#81c995' }}
                                  spellCheck={false}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Hermetic Verification Command Card with Copy */}
                    <div style={styles.resultCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#8ab4f8' }}>Hermetic Verification Command</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(activeRecipe.verificationCommand)
                            showNotificationToast('✓ Copied verification command!')
                          }}
                          style={styles.copyButton}
                        >
                          📋 Copy Command
                        </button>
                      </div>
                      <code style={{ display: 'block', background: '#121316', padding: '8px 12px', borderRadius: '6px', color: '#81c995', fontSize: '12px' }}>
                        {activeRecipe.verificationCommand}
                      </code>
                    </div>

                    {recipeResult && (
                      <div style={styles.resultCard}>
                        <h4 style={styles.resultCardTitle}>Automated Verification Steps</h4>
                        <ul style={styles.actionPlanList}>
                          {recipeResult.verificationSteps.map((step: string) => (
                            <li key={step} style={styles.actionPlanItem}>{step}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PRACTITIONER SKILLS (5) */}
          {state.activeTab === 'skills' && (
            <div>
              <h3 style={styles.sectionHeading}>⚡ Practitioner Skills (5)</h3>
              <p style={styles.sectionDesc}>
                High-maturity runtime skills baked directly into DeepSeek Harness.
                Each skill equips the model with specialized architectural guidance, concrete workflow steps, and executable prompts.
              </p>

              <div style={styles.skillsGrid}>
                {PRACTITIONER_SKILLS.map((skill: PractitionerSkillInfo) => (
                  <div key={skill.name} style={styles.skillCard}>
                    <div style={styles.skillCardHeader}>
                      <div>
                        <span style={styles.skillName}>/{skill.name}</span>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginTop: '2px' }}>
                          {skill.title}
                        </div>
                      </div>
                      <span style={styles.skillSourceBadge}>Runtime In-Box</span>
                    </div>

                    <p style={styles.skillDesc}>{skill.description}</p>

                    <div style={styles.skillSection}>
                      <span style={styles.skillSectionTitle}>When to Use:</span>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#bdc1c6' }}>{skill.whenToUse}</p>
                    </div>

                    <div style={styles.skillSection}>
                      <span style={styles.skillSectionTitle}>Agent Workflow Steps:</span>
                      <ol style={{ margin: '4px 0 0', paddingLeft: '16px', fontSize: '11px', color: '#e8eaed' }}>
                        {skill.workflowSteps.map(step => (
                          <li key={step} style={{ marginBottom: '2px' }}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    <div style={styles.skillSection}>
                      <span style={styles.skillSectionTitle}>Starter Prompts (Click to Run):</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                        {skill.starterPrompts.map(prompt => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => {
                              sendPromptToHarnessComposer(`/${skill.name} ${prompt}`, { autoSubmit: true })
                            }}
                            style={styles.starterPromptPill}
                            title="Click to dispatch this prompt to active session"
                          >
                            💬 "{prompt}"
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          sendPromptToHarnessComposer(
                            `/${skill.name} Please activate the ${skill.name} skill to guide our workload migration.\nGoal: Execute discovery and technical remediation following the official playbook.\nSkill summary: ${skill.description}`,
                            { autoSubmit: true },
                          )
                        }}
                        style={styles.skillActivateBtn}
                        title="Send command to active chat session to activate this skill"
                      >
                        🚀 Activate Skill in Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(skill.content)
                          showNotificationToast(`✓ Copied /${skill.name} skill instructions!`)
                        }}
                        style={styles.skillCopyBtn}
                      >
                        📋 Copy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  overlayBackdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.78)',
    backdropFilter: 'blur(8px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  modalContainer: {
    width: '95vw',
    maxWidth: '1320px',
    height: '90vh',
    maxHeight: '920px',
    background: '#1a1b1e',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.6)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    color: '#e8eaed',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    background: '#202124',
  },
  headerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerIconWrap: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: 'rgba(66, 133, 244, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#4285F4',
  },
  headerTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
  },
  studioBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '12px',
    background: 'rgba(52, 168, 83, 0.2)',
    color: '#81c995',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  headerSubtitle: {
    margin: '2px 0 0',
    fontSize: '12px',
    color: '#9aa0a6',
  },
  scanButtonHeader: {
    background: 'rgba(66, 133, 244, 0.2)',
    border: '1px solid rgba(66, 133, 244, 0.4)',
    color: '#8ab4f8',
    padding: '6px 14px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#9aa0a6',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '6px 10px',
    borderRadius: '6px',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '8px 24px',
    background: '#1e1f22',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  tab: {
    padding: '8px 16px',
    borderRadius: '6px',
    background: 'transparent',
    border: 'none',
    color: '#9aa0a6',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  tabActive: {
    padding: '8px 16px',
    borderRadius: '6px',
    background: 'rgba(66, 133, 244, 0.15)',
    border: '1px solid rgba(66, 133, 244, 0.3)',
    color: '#8ab4f8',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  contentArea: {
    flex: 1,
    padding: '20px 24px',
    overflowY: 'auto',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  filterButtonGroup: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    padding: '6px 12px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#9aa0a6',
    fontSize: '12px',
    cursor: 'pointer',
  },
  filterBtnActive: {
    padding: '6px 12px',
    borderRadius: '6px',
    background: '#4285F4',
    border: '1px solid #4285F4',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  searchInput: {
    flex: 1,
    minWidth: '240px',
    padding: '8px 12px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    fontSize: '13px',
    outline: 'none',
  },
  blueprintGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: '16px',
  },
  blueprintCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  blueprintCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  blueprintCardTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#ffffff',
    lineHeight: '1.3',
  },
  domainTag: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(66, 133, 244, 0.15)',
    color: '#8ab4f8',
  },
  scoreBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(52, 168, 83, 0.15)',
    color: '#81c995',
  },
  blueprintDesc: {
    margin: 0,
    fontSize: '12px',
    lineHeight: '1.45',
    color: '#bdc1c6',
  },
  stackFlowBox: {
    background: 'rgba(0, 0, 0, 0.25)',
    borderRadius: '6px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  stackFlowRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  stackLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#f28b82',
    minWidth: '68px',
  },
  stackChipsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  sourceChip: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(242, 139, 130, 0.12)',
    color: '#f28b82',
  },
  targetChip: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(52, 168, 83, 0.15)',
    color: '#81c995',
  },
  deliverablesBox: {
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '6px',
    padding: '8px 10px',
  },
  deliverablesTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#8ab4f8',
  },
  deliverablesList: {
    margin: '4px 0 0',
    padding: 0,
    listStyle: 'none',
  },
  deliverableItem: {
    fontSize: '11px',
    color: '#bdc1c6',
    lineHeight: '1.4',
    marginBottom: '2px',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    gap: '6px',
    flexWrap: 'wrap',
  },
  cardPrimaryBtn: {
    background: '#4285F4',
    border: 'none',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: '4px',
  },
  cardSecondaryBtn: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#bdc1c6',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '5px 10px',
    borderRadius: '4px',
  },
  cardScopeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#81c995',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '5px 8px',
  },
  splitLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 380px) 1fr',
    gap: '24px',
    height: '100%',
  },
  formPanel: {
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '10px',
    padding: '16px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    overflowY: 'auto',
  },
  resultPanel: {
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '10px',
    padding: '20px',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    overflowY: 'auto',
  },
  sectionHeading: {
    margin: '0 0 4px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
  },
  sectionDesc: {
    margin: '0 0 16px',
    fontSize: '12px',
    color: '#9aa0a6',
    lineHeight: '1.4',
  },
  scanNoticeBox: {
    padding: '10px 12px',
    borderRadius: '6px',
    background: 'rgba(52, 168, 83, 0.1)',
    border: '1px solid rgba(52, 168, 83, 0.25)',
    marginBottom: '14px',
  },
  scanInlineBtn: {
    background: 'rgba(66, 133, 244, 0.15)',
    border: '1px solid rgba(66, 133, 244, 0.3)',
    color: '#8ab4f8',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  fieldGroup: {
    marginBottom: '14px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: '#bdc1c6',
    marginBottom: '6px',
  },
  selectInput: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: '13px',
  },
  textInput: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: '13px',
    boxSizing: 'border-box',
  },
  primaryButton: {
    width: '100%',
    padding: '10px 16px',
    borderRadius: '6px',
    background: '#4285F4',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
  primaryButtonInline: {
    padding: '6px 12px',
    borderRadius: '4px',
    background: '#4285F4',
    border: 'none',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '6px 10px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: '11px',
    cursor: 'pointer',
  },
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    flexWrap: 'wrap',
    gap: '12px',
  },
  resultTitle: {
    display: 'block',
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
  },
  resultSourceTag: {
    fontSize: '12px',
    color: '#8ab4f8',
  },
  agentExecuteBtn: {
    background: 'rgba(52, 168, 83, 0.2)',
    border: '1px solid rgba(52, 168, 83, 0.4)',
    color: '#81c995',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  reportActionBtn: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#bdc1c6',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    cursor: 'pointer',
  },
  scoreGaugeBox: {
    textAlign: 'right',
  },
  scoreGaugeValue: {
    fontSize: '26px',
    fontWeight: 800,
    color: '#81c995',
  },
  scoreGaugeLabel: {
    fontSize: '10px',
    color: '#9aa0a6',
    textTransform: 'uppercase',
  },
  dimensionStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    marginBottom: '16px',
  },
  dimensionItem: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
    padding: '8px',
    textAlign: 'center',
  },
  dimensionVal: {
    display: 'block',
    fontSize: '16px',
    fontWeight: 700,
    color: '#ffffff',
  },
  dimensionLbl: {
    fontSize: '10px',
    color: '#9aa0a6',
  },
  resultCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
    padding: '14px',
    marginBottom: '14px',
  },
  resultCardTitle: {
    margin: '0 0 10px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#8ab4f8',
  },
  resultTargetText: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
  },
  waveTimelineContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  waveItemBox: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    padding: '10px 12px',
  },
  waveHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  waveBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(66, 133, 244, 0.2)',
    color: '#8ab4f8',
  },
  waveName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#ffffff',
    flex: 1,
  },
  waveDuration: {
    fontSize: '11px',
    color: '#81c995',
    fontWeight: 600,
  },
  waveFocusText: {
    margin: '0 0 4px',
    fontSize: '11px',
    color: '#e8eaed',
    lineHeight: '1.4',
  },
  waveDeliverablesList: {
    fontSize: '11px',
    color: '#9aa0a6',
    marginBottom: '6px',
  },
  waveExitCriteria: {
    fontSize: '11px',
    color: '#bdc1c6',
    background: 'rgba(0, 0, 0, 0.2)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  effortMetricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },
  effortMetricCard: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    padding: '10px',
    textAlign: 'center',
  },
  effortMetricNum: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#ffffff',
  },
  effortMetricLbl: {
    fontSize: '10px',
    color: '#9aa0a6',
    marginTop: '2px',
  },
  actionPlanList: {
    margin: 0,
    paddingLeft: '18px',
  },
  actionPlanItem: {
    fontSize: '12px',
    lineHeight: '1.5',
    color: '#e8eaed',
    marginBottom: '6px',
  },
  riskList: {
    margin: 0,
    paddingLeft: '18px',
  },
  riskItem: {
    fontSize: '12px',
    lineHeight: '1.45',
    color: '#f28b82',
    marginBottom: '4px',
  },
  recipeSelectBtn: {
    textAlign: 'left',
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    color: '#ffffff',
    cursor: 'pointer',
  },
  recipeSelectBtnActive: {
    textAlign: 'left',
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(66, 133, 244, 0.15)',
    border: '1px solid #4285F4',
    color: '#ffffff',
    cursor: 'pointer',
  },
  targetFilesBox: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    marginBottom: '12px',
  },
  diffContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '14px',
  },
  diffPane: {
    background: '#121316',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  diffHeaderBefore: {
    padding: '6px 10px',
    background: 'rgba(242, 139, 130, 0.15)',
    color: '#f28b82',
    fontSize: '11px',
    fontWeight: 600,
    borderBottom: '1px solid rgba(242, 139, 130, 0.2)',
  },
  diffHeaderAfter: {
    padding: '6px 10px',
    background: 'rgba(52, 168, 83, 0.15)',
    color: '#81c995',
    fontSize: '11px',
    fontWeight: 600,
    borderBottom: '1px solid rgba(52, 168, 83, 0.2)',
  },
  diffCode: {
    margin: 0,
    padding: '10px',
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#e8eaed',
    whiteSpace: 'pre-wrap',
    lineHeight: '1.4',
    maxHeight: '220px',
    overflowY: 'auto',
  },
  ingressExpanderCard: {
    background: 'rgba(52, 168, 83, 0.05)',
    border: '1px solid rgba(52, 168, 83, 0.2)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '14px',
  },
  ingressExpanderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  translatorPanesMini: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    height: '240px',
  },
  paneHalf: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  paneHeader: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#bdc1c6',
    marginBottom: '4px',
  },
  paneHeaderWithAction: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11px',
    fontWeight: 600,
    color: '#bdc1c6',
    marginBottom: '4px',
  },
  codeTextareaMini: {
    flex: 1,
    width: '100%',
    padding: '8px',
    borderRadius: '6px',
    background: '#121316',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#e8eaed',
    fontFamily: 'monospace',
    fontSize: '11px',
    lineHeight: '1.35',
    resize: 'none',
    boxSizing: 'border-box',
    outline: 'none',
  },
  copyButton: {
    background: 'rgba(66, 133, 244, 0.2)',
    border: '1px solid rgba(66, 133, 244, 0.4)',
    color: '#8ab4f8',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
  },
  skillsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: '16px',
  },
  skillCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  skillCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  skillName: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#81c995',
    fontFamily: 'monospace',
  },
  skillSourceBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#bdc1c6',
  },
  skillDesc: {
    margin: 0,
    fontSize: '12px',
    color: '#bdc1c6',
    lineHeight: '1.4',
  },
  skillSection: {
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '6px',
    padding: '8px 10px',
  },
  skillSectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#8ab4f8',
  },
  starterPromptPill: {
    textAlign: 'left',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    padding: '4px 8px',
    color: '#e8eaed',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
  skillActivateBtn: {
    flex: 1,
    background: 'rgba(52, 168, 83, 0.2)',
    border: '1px solid rgba(52, 168, 83, 0.4)',
    color: '#81c995',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  skillCopyBtn: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#8ab4f8',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
}
