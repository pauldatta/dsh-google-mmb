/**
 * Migration Center Workbench - Full Interactive Modal UI.
 * Provides Workload Assessment, Portfolio Explorer, Ingress-to-Gateway Translator,
 * Mature Skills Library, Modernization Recipes, and Seamless Composer Handoffs.
 *
 * @module @deepseek-ai/dsh-mmb-migration-workbench/client/MigrationCenterWorkbench
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { MMB_ASSETS } from '../catalog-data.ts'
import { assessWorkload } from '../assessment-engine.ts'
import { translateIngressToGatewayApi } from '../ingress-translator.ts'
import { MODERNIZATION_RECIPES, runModernizationRecipe } from '../recipes.ts'
import { MMB_RUNTIME_SKILLS } from '../skills.ts'
import type { CloudSource, MmbAsset, RecipeRunResult, WorkloadAssessmentResult, WorkloadType } from '../types.ts'
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

const PRESET_MULTIDOC_INGRESS = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: frontend-ingress
  namespace: frontend
  annotations:
    kubernetes.io/ingress.class: "gke-external"
spec:
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-svc
                port:
                  number: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: backend
  annotations:
    kubernetes.io/ingress.class: "gke-external"
spec:
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /api/v1
            pathType: Prefix
            backend:
              service:
                name: api-service
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
  const [assessTech, setAssessTech] = useState('Oracle 19c')
  const [assessScale, setAssessScale] = useState<'small' | 'medium' | 'large' | 'enterprise'>('large')
  const [hasTests, setHasTests] = useState<boolean>(true)
  const [assessResult, setAssessResult] = useState<WorkloadAssessmentResult | null>(() =>
    assessWorkload({ workloadType: 'database', sourcePlatform: 'aws', sourceTechnology: 'Oracle 19c', workloadScale: 'large' }),
  )

  // Local state for Ingress translator tab
  const [ingressInput, setIngressInput] = useState(SAMPLE_INGRESS_YAML)
  const [translatedOutput, setTranslatedOutput] = useState(() => translateIngressToGatewayApi({ manifest: SAMPLE_INGRESS_YAML }))
  const [copied, setCopied] = useState(false)

  // Local state for recipes tab
  const [selectedRecipe, setSelectedRecipe] = useState<string>('oracle-plsql-to-bigquery')
  const [recipeResult, setRecipeResult] = useState<RecipeRunResult | null>(() => runModernizationRecipe('oracle-plsql-to-bigquery', true))

  // Filtered assets for Portfolio tab
  const [domainFilter, setDomainFilter] = useState<'all' | 'migrate' | 'modernize' | 'build' | 'top-tier'>('all')
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
      const res = translateIngressToGatewayApi({ manifest: state.ingressPreload })
      setTranslatedOutput(res)
    }
  }, [state.ingressPreload])

  useEffect(() => {
    if (state.searchQuery) {
      setSearchQuery(state.searchQuery)
    }
  }, [state.searchQuery])

  const filteredAssets = useMemo(() => {
    let list = [...MMB_ASSETS]
    if (domainFilter === 'top-tier') {
      list = list.filter(a => a.score >= 3.0)
    } else if (domainFilter !== 'all') {
      list = list.filter(a => a.domain === domainFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.realityCheck.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q)) ||
        a.targetGcpServices.some(s => s.toLowerCase().includes(q)),
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
        // Auto-populate form
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

  const handleLoadDiscoveredIngress = (): void => {
    if (scanResult?.sampleIngressYaml) {
      setIngressInput(scanResult.sampleIngressYaml.content)
      const res = translateIngressToGatewayApi({ manifest: scanResult.sampleIngressYaml.content })
      setTranslatedOutput(res)
      workbenchStore.setActiveTab('ingress')
      showNotificationToast(`✓ Loaded Ingress manifest from ${scanResult.sampleIngressYaml.path}`)
    }
  }

  const handleTranslateIngress = (): void => {
    const res = translateIngressToGatewayApi({ manifest: ingressInput })
    setTranslatedOutput(res)
  }

  const handleCopyTranslated = (): void => {
    navigator.clipboard?.writeText(translatedOutput.combinedYaml)
    setCopied(true)
    showNotificationToast('✓ Copied Gateway API YAML to clipboard!')
    setTimeout(() => { setCopied(false) }, 2000)
  }

  const handleDownloadGatewayYaml = (): void => {
    const blob = new Blob([translatedOutput.combinedYaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'gateway-api-resources.yaml'
    a.click()
    URL.revokeObjectURL(url)
    showNotificationToast('✓ Downloaded gateway-api-resources.yaml')
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

  const handleSimulateRecipe = (id: string): void => {
    setSelectedRecipe(id)
    const res = runModernizationRecipe(id, true)
    setRecipeResult(res)
  }

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
              <h2 style={styles.headerTitle}>{t('workbench.title')}</h2>
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

        {/* Tab Navigation */}
        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('portfolio') }}
            style={state.activeTab === 'portfolio' ? styles.tabActive : styles.tab}
          >
            📊 {t('tab.portfolio')}
          </button>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('assessment') }}
            style={state.activeTab === 'assessment' ? styles.tabActive : styles.tab}
          >
            ⚡ {t('tab.assessment')}
          </button>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('ingress') }}
            style={state.activeTab === 'ingress' ? styles.tabActive : styles.tab}
          >
            🔄 {t('tab.ingress')}
          </button>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('skills') }}
            style={state.activeTab === 'skills' ? styles.tabActive : styles.tab}
          >
            🧠 {t('tab.skills')} ({MMB_RUNTIME_SKILLS.length})
          </button>
          <button
            type="button"
            onClick={() => { workbenchStore.setActiveTab('recipes') }}
            style={state.activeTab === 'recipes' ? styles.tabActive : styles.tab}
          >
            🛠️ {t('tab.recipes')} ({MODERNIZATION_RECIPES.length})
          </button>
        </div>

        {/* Tab Content */}
        <div style={styles.contentArea}>
          {/* TAB 1: PORTFOLIO & 46 ASSETS */}
          {state.activeTab === 'portfolio' && (
            <div>
              {/* Stats Strip */}
              <div style={styles.statsStrip}>
                <div style={styles.statCard}>
                  <div style={styles.statNumber}>46</div>
                  <div style={styles.statLabel}>{t('stats.total')}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={{ ...styles.statNumber, color: '#34A853' }}>7</div>
                  <div style={styles.statLabel}>{t('stats.migrate')}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={{ ...styles.statNumber, color: '#4285F4' }}>18</div>
                  <div style={styles.statLabel}>{t('stats.modernize')}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={{ ...styles.statNumber, color: '#FBBC04' }}>21</div>
                  <div style={styles.statLabel}>{t('stats.build')}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={{ ...styles.statNumber, color: '#EA4335' }}>4</div>
                  <div style={styles.statLabel}>{t('stats.topTier')}</div>
                </div>
                <div style={styles.statCard}>
                  <div style={{ ...styles.statNumber, color: '#A142F4' }}>3.5 / 5</div>
                  <div style={styles.statLabel}>Peak (Oracle MCP)</div>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div style={styles.filterRow}>
                <div style={styles.filterButtonGroup}>
                  {(['all', 'migrate', 'modernize', 'build', 'top-tier'] as const).map(dom => (
                    <button
                      key={dom}
                      type="button"
                      onClick={() => { setDomainFilter(dom) }}
                      style={domainFilter === dom ? styles.filterBtnActive : styles.filterBtn}
                    >
                      {dom === 'all' ? t('filter.all') :
                        dom === 'top-tier' ? '⭐ Top-Tier (3.0+)' :
                          dom.charAt(0).toUpperCase() + dom.slice(1)}
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

              {/* Asset Grid */}
              <div style={styles.assetGrid}>
                {filteredAssets.map((asset: MmbAsset) => (
                  <div key={asset.id} style={styles.assetCard}>
                    <div style={styles.assetCardHeader}>
                      <div style={styles.assetCardTitleWrap}>
                        <span style={styles.assetCardName}>{asset.name}</span>
                        <span style={{
                          ...styles.domainTag,
                          background: asset.domain === 'migrate' ? 'rgba(52,168,83,0.15)' :
                            asset.domain === 'modernize' ? 'rgba(66,133,244,0.15)' : 'rgba(251,188,4,0.15)',
                          color: asset.domain === 'migrate' ? '#34A853' :
                            asset.domain === 'modernize' ? '#669df6' : '#fdd663',
                        }}>
                          {asset.domain.toUpperCase()}
                        </span>
                      </div>
                      <div style={{
                        ...styles.scoreBadge,
                        background: asset.score >= 3.0 ? 'rgba(52,168,83,0.2)' :
                          asset.score >= 2.0 ? 'rgba(66,133,244,0.2)' : 'rgba(255,255,255,0.08)',
                        color: asset.score >= 3.0 ? '#81c995' :
                          asset.score >= 2.0 ? '#8ab4f8' : '#9aa0a6',
                      }}>
                        ★ {asset.score.toFixed(1)} / 5.0
                      </div>
                    </div>

                    <p style={styles.assetRealityText}>{asset.realityCheck}</p>

                    <div style={styles.servicesRow}>
                      <span style={styles.servicesLabel}>{t('card.services')}:</span>
                      {asset.targetGcpServices.map((s: string) => (
                        <span key={s} style={styles.serviceChip}>{s}</span>
                      ))}
                    </div>

                    <div style={styles.recommendationBox}>
                      <strong style={{ color: '#8ab4f8' }}>Roadmap:</strong> {asset.antigravityRecommendation}
                    </div>

                    <div style={styles.cardFooter}>
                      <span style={styles.filesText}>
                        {asset.codeFiles} files {asset.hasTests ? '• Tests ✓' : '• No Tests'}
                      </span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            sendPromptToHarnessComposer(
                              `Review the Google Cloud blueprint "${asset.name}" (${asset.domain.toUpperCase()} domain, score ${asset.score.toFixed(1)}/5.0).\nTarget GCP Services: ${asset.targetGcpServices.join(', ')}.\nContext: ${asset.realityCheck}\nStrategic Roadmap: ${asset.antigravityRecommendation}\nProvide detailed architectural recommendations for migrating our enterprise workloads to this pattern.`,
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
                            sendPromptToHarnessComposer(
                              `Execute migration analysis and setup for blueprint "${asset.name}". Target Google Cloud services: ${asset.targetGcpServices.join(', ')}. Examine workspace assets, check prerequisite tools, and formulate the landing zone execution plan.`,
                              { autoSubmit: true },
                            )
                          }}
                          style={styles.cardRunBtn}
                          title="Immediately trigger execution with active subagent"
                        >
                          🚀 Run with Agent
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAssessTech(asset.name)
                            let nextType: WorkloadType = 'application'
                            if (asset.domain === 'migrate' && asset.id.includes('lakehouse')) nextType = 'data-pipeline'
                            else if (asset.id.includes('oracle') || asset.id.includes('data')) nextType = 'database'
                            else if (asset.id.includes('k8s') || asset.id.includes('gke')) nextType = 'kubernetes'
                            setAssessType(nextType)
                            const updated = assessWorkload({
                              workloadType: nextType,
                              sourcePlatform: assessSource,
                              sourceTechnology: asset.name,
                              workloadScale: assessScale,
                              hasTests: asset.hasTests,
                            })
                            setAssessResult(updated)
                            workbenchStore.setActiveTab('assessment')
                          }}
                          style={styles.cardActionBtn}
                        >
                          ⚡ Assess →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: WORKLOAD ASSESSMENT */}
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
                      Found {scanResult.markers.length} migration markers.
                      {scanResult.sampleIngressYaml && (
                        <button
                          type="button"
                          onClick={handleLoadDiscoveredIngress}
                          style={styles.loadIngressNoticeBtn}
                        >
                          Load Ingress into Tab 3 ↗
                        </button>
                      )}
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
                    <option value="data-pipeline">Data Lake & Pipeline (Hadoop, Spark, Iceberg)</option>
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
                    placeholder="e.g. Oracle 19c, K8s Ingress NGINX, PySpark 2.4, Spring Boot 2.7"
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
                              `Execute the 4-Wave Migration Plan for ${assessResult.sourceTechnology} (${assessResult.sourcePlatform.toUpperCase()}) -> ${assessResult.recommendedTarget}.\nBegin with Wave 0: Discovery & Landing Zone. Recommended Skills: ${assessResult.recommendedSkills.map(s => `/${s}`).join(', ')}.\nAction Plan:\n${assessResult.actionPlan.join('\n')}`,
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
                        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#e8eaed' }}>
                          <strong style={{ color: '#81c995' }}>Ops Efficiency:</strong> {assessResult.tcoModel.opsEfficiencyGain}
                        </p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#e8eaed' }}>
                          <strong style={{ color: '#fdd663' }}>Risk Mitigation:</strong> {assessResult.tcoModel.riskMitigationSummary}
                        </p>
                      </div>
                    )}

                    {/* Recommended Blueprints & Skills */}
                    <div style={styles.resultCard}>
                      <h4 style={styles.resultCardTitle}>📦 Recommended Blueprints &amp; Mature Skills</h4>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {assessResult.recommendedBlueprints.map((bp: string) => (
                          <span key={bp} style={styles.blueprintChip}>Blueprint: {bp}</span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {assessResult.recommendedSkills.map((sk: string) => (
                          <span key={sk} style={styles.skillChip}>Skill: {sk}</span>
                        ))}
                      </div>
                    </div>

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

          {/* TAB 3: INGRESS TO GATEWAY API TRANSLATOR */}
          {state.activeTab === 'ingress' && (
            <div>
              <div style={styles.ingressTopBar}>
                <div>
                  <h3 style={styles.sectionHeading}>🔄 {t('ingress.title')}</h3>
                  <p style={styles.sectionDesc}>
                    Converts standard Kubernetes networking.k8s.io/v1 Ingress manifests into GKE
                    GatewayClass (gke-l7-global-external-managed) &amp; HTTPRoute definitions.
                    Supports single-document manifests and multi-document YAML streams (---).
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                    onClick={() => {
                      setIngressInput(PRESET_MULTIDOC_INGRESS)
                      const res = translateIngressToGatewayApi({ manifest: PRESET_MULTIDOC_INGRESS })
                      setTranslatedOutput(res)
                    }}
                    style={styles.secondaryButton}
                  >
                    📑 Multi-Doc Stream (---)
                  </button>
                  <button
                    type="button"
                    onClick={handleTranslateIngress}
                    style={styles.primaryButtonInline}
                  >
                    ⚡ {t('ingress.translate')}
                  </button>
                </div>
              </div>

              <div style={styles.translatorPanes}>
                {/* Left: Input Ingress */}
                <div style={styles.paneHalf}>
                  <div style={styles.paneHeader}>Source Ingress Manifest (YAML)</div>
                  <textarea
                    value={ingressInput}
                    onChange={(e) => { setIngressInput(e.target.value) }}
                    style={styles.codeTextarea}
                    spellCheck={false}
                  />
                </div>

                {/* Right: Output Gateway API */}
                <div style={styles.paneHalf}>
                  <div style={styles.paneHeaderWithAction}>
                    <span>Target GKE Gateway API Manifest (YAML)</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={handleCopyTranslated}
                        style={styles.copyButton}
                      >
                        {copied ? '✓ ' + t('ingress.copied') : '📋 ' + t('ingress.copy')}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadGatewayYaml}
                        style={styles.copyButton}
                      >
                        📥 Download YAML
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sendPromptToHarnessComposer(
                            `Review and apply the following translated GKE Gateway API resources to our cluster:\n\n\`\`\`yaml\n${translatedOutput.combinedYaml}\`\`\`\n1. Validate syntax with \`kubectl apply --dry-run=client -f -\`.\n2. Confirm GatewayClass and HTTPRoute binding.\n3. Report verification results.`,
                            { autoSubmit: false },
                          )
                        }}
                        style={styles.agentApplyBtn}
                      >
                        🚀 Apply with Agent
                      </button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={translatedOutput.combinedYaml}
                    style={{ ...styles.codeTextarea, background: 'rgba(0,0,0,0.4)', color: '#81c995' }}
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Translation Summary Strip */}
              <div style={styles.translationSummary}>
                <span>✓ Converted <strong>{translatedOutput.summary.routesConverted}</strong> Route Rules</span>
                <span>• Backend Services: <strong>{translatedOutput.summary.backendServices.join(', ') || 'none'}</strong></span>
                <span>• TLS Hosts: <strong>{translatedOutput.summary.tlsHosts.join(', ') || 'None (HTTP only)'}</strong></span>
                {translatedOutput.summary.crossNamespaceGrantGenerated && (
                  <span>• ReferenceGrant: <strong style={{ color: '#81c995' }}>Generated ✓</strong></span>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: MATURE SKILLS */}
          {state.activeTab === 'skills' && (
            <div>
              <h3 style={styles.sectionHeading}>🧠 Mature MMB Runtime Skills</h3>
              <p style={styles.sectionDesc}>
                Baked-in skills registered directly into the DeepSeek Harness runtime (<code style={{ color: '#8ab4f8' }}>ctx.skills</code>) available to agents via <code style={{ color: '#8ab4f8' }}>tool-skill</code>.
              </p>

              <div style={styles.skillsGrid}>
                {MMB_RUNTIME_SKILLS.map(skill => (
                  <div key={skill.name} style={styles.skillCard}>
                    <div style={styles.skillCardHeader}>
                      <span style={styles.skillName}>/{skill.name}</span>
                      <span style={styles.skillSourceBadge}>Runtime In-Box</span>
                    </div>
                    <p style={styles.skillDesc}>{skill.description}</p>
                    <div style={styles.skillContentPreview}>
                      <pre style={styles.skillPre}>{skill.content.slice(0, 300)}...</pre>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
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

          {/* TAB 5: MODERNIZATION RECIPES */}
          {state.activeTab === 'recipes' && (
            <div style={styles.splitLayout}>
              {/* Left Column: Recipes List */}
              <div style={styles.formPanel}>
                <h3 style={styles.sectionHeading}>🛠️ Automated Modernization Recipes</h3>
                <p style={styles.sectionDesc}>
                  Lossless AST refactoring recipes inspired by OpenRewrite and Moderne for enterprise codebases.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {MODERNIZATION_RECIPES.map(recipe => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => { handleSimulateRecipe(recipe.id) }}
                      style={selectedRecipe === recipe.id ? styles.recipeSelectBtnActive : styles.recipeSelectBtn}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                        {recipe.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--dsw-text-secondary, #9aa0a6)' }}>
                        Category: {recipe.category.toUpperCase()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Column: Execution details */}
              <div style={styles.resultPanel}>
                {recipeResult && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <h3 style={{ ...styles.sectionHeading, margin: 0 }}>{recipeResult.title}</h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const recipe = MODERNIZATION_RECIPES.find(r => r.id === recipeResult.recipeId)
                            sendPromptToHarnessComposer(
                              `Execute Modernization Recipe "${recipeResult.title}" (${recipeResult.recipeId}).\nSource Pattern: ${recipe?.sourcePattern ?? ''}\nTarget Pattern: ${recipe?.targetPattern ?? ''}\nVerification Command: \`${recipe?.verificationCommand ?? ''}\`\nExecute code refactoring on target files and run the verification command to confirm clean compilation and zero regression.`,
                              { autoSubmit: true },
                            )
                          }}
                          style={styles.agentExecuteBtn}
                        >
                          🚀 Execute Recipe in Chat
                        </button>
                        <span style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', background: 'rgba(52,168,83,0.2)', color: '#81c995' }}>
                          STATUS: {recipeResult.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <p style={{ ...styles.sectionDesc, marginBottom: '16px' }}>{recipeResult.description}</p>

                    {/* Verification Command Card with Copy */}
                    {(() => {
                      const recipe = MODERNIZATION_RECIPES.find(r => r.id === recipeResult.recipeId)
                      if (!recipe) return null
                      return (
                        <div style={styles.resultCard}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#8ab4f8' }}>Hermetic Verification Command</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(recipe.verificationCommand)
                                showNotificationToast('✓ Copied verification command!')
                              }}
                              style={styles.copyButton}
                            >
                              📋 Copy Command
                            </button>
                          </div>
                          <code style={{ display: 'block', background: '#121316', padding: '8px 12px', borderRadius: '6px', color: '#81c995', fontSize: '12px' }}>
                            {recipe.verificationCommand}
                          </code>
                        </div>
                      )
                    })()}

                    <div style={styles.resultCard}>
                      <h4 style={styles.resultCardTitle}>Automated Verification Steps</h4>
                      <ul style={styles.actionPlanList}>
                        {recipeResult.verificationSteps.map((step: string) => (
                          <li key={step} style={styles.actionPlanItem}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
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
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(8px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  modalContainer: {
    width: '94vw',
    maxWidth: '1280px',
    height: '88vh',
    maxHeight: '900px',
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
  statsStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  statCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
    padding: '12px 16px',
    textAlign: 'center',
  },
  statNumber: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#ffffff',
  },
  statLabel: {
    fontSize: '11px',
    color: '#9aa0a6',
    marginTop: '2px',
    textTransform: 'uppercase',
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
  assetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: '16px',
  },
  assetCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  assetCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
  },
  assetCardTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  assetCardName: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
  },
  domainTag: {
    alignSelf: 'flex-start',
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
  },
  scoreBadge: {
    fontSize: '12px',
    fontWeight: 700,
    padding: '4px 8px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
  },
  assetRealityText: {
    margin: 0,
    fontSize: '12px',
    lineHeight: '1.45',
    color: '#bdc1c6',
  },
  servicesRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'center',
  },
  servicesLabel: {
    fontSize: '11px',
    color: '#9aa0a6',
    marginRight: '2px',
  },
  serviceChip: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    background: 'rgba(66, 133, 244, 0.1)',
    color: '#8ab4f8',
  },
  recommendationBox: {
    fontSize: '11px',
    lineHeight: '1.4',
    padding: '8px 10px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderLeft: '3px solid #8ab4f8',
    color: '#e8eaed',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    flexWrap: 'wrap',
    gap: '6px',
  },
  filesText: {
    fontSize: '11px',
    color: '#80868b',
  },
  cardSecondaryBtn: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#bdc1c6',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  cardRunBtn: {
    background: 'rgba(66, 133, 244, 0.2)',
    border: '1px solid rgba(66, 133, 244, 0.4)',
    color: '#8ab4f8',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  cardActionBtn: {
    background: 'transparent',
    border: 'none',
    color: '#81c995',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 6px',
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
  loadIngressNoticeBtn: {
    marginLeft: '8px',
    background: 'transparent',
    border: 'none',
    color: '#8ab4f8',
    cursor: 'pointer',
    fontWeight: 600,
    padding: 0,
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
    padding: '8px 14px',
    borderRadius: '6px',
    background: '#4285F4',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '8px 12px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    fontSize: '12px',
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
  blueprintChip: {
    fontSize: '11px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgba(66, 133, 244, 0.15)',
    color: '#8ab4f8',
  },
  skillChip: {
    fontSize: '11px',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgba(52, 168, 83, 0.15)',
    color: '#81c995',
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
  ingressTopBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  translatorPanes: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    height: '420px',
  },
  paneHalf: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  paneHeader: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#bdc1c6',
    marginBottom: '6px',
  },
  paneHeaderWithAction: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: '#bdc1c6',
    marginBottom: '6px',
    flexWrap: 'wrap',
    gap: '6px',
  },
  codeTextarea: {
    flex: 1,
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    background: '#121316',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#e8eaed',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: '1.4',
    resize: 'none',
    boxSizing: 'border-box',
    outline: 'none',
  },
  copyButton: {
    background: 'rgba(66, 133, 244, 0.2)',
    border: '1px solid rgba(66, 133, 244, 0.4)',
    color: '#8ab4f8',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
  },
  agentApplyBtn: {
    background: 'rgba(52, 168, 83, 0.2)',
    border: '1px solid rgba(52, 168, 83, 0.4)',
    color: '#81c995',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  translationSummary: {
    marginTop: '12px',
    padding: '10px 14px',
    borderRadius: '6px',
    background: 'rgba(52, 168, 83, 0.1)',
    border: '1px solid rgba(52, 168, 83, 0.2)',
    fontSize: '12px',
    color: '#81c995',
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  skillsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
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
    alignItems: 'center',
  },
  skillName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#81c995',
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
  skillContentPreview: {
    background: '#121316',
    borderRadius: '6px',
    padding: '8px',
    maxHeight: '100px',
    overflow: 'hidden',
  },
  skillPre: {
    margin: 0,
    fontSize: '10px',
    color: '#9aa0a6',
    whiteSpace: 'pre-wrap',
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
}
