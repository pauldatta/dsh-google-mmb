/**
 * Workspace Scanner for MMB Migration Center.
 * Automatically scans workspace files to detect technologies, frameworks,
 * Kubernetes manifests, databases, and recommends migration paths.
 *
 * @module @deepseek-ai/dsh-mmb-migration-workbench/workspace-scanner
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

export interface WorkspaceMarker {
  readonly category: string
  readonly file: string
  readonly detail: string
}

export interface SampleIngress {
  readonly path: string
  readonly content: string
}

export interface WorkspaceScanResult {
  readonly targetDirectory: string
  readonly detectedWorkloadType: 'database' | 'kubernetes' | 'data-pipeline' | 'app-modernization'
  readonly detectedSourceTech: string
  readonly totalFilesScanned: number
  readonly markers: readonly WorkspaceMarker[]
  readonly sampleIngressYaml?: SampleIngress | undefined
  readonly recommendedRecipes: readonly string[]
  readonly recommendedSkills: readonly string[]
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'lib',
  '.dsh',
  '.cache',
  '.worktrees',
  '.gemini',
  'coverage',
  '.turbo',
  'vendor',
  '.next',
  '.build',
  'target',
  'bin',
  'obj',
])

const DEFAULT_FALLBACK_INGRESS = `apiVersion: networking.k8s.io/v1
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
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-web
                port:
                  number: 80`

/**
 * Recursively scans a workspace directory up to a max depth of 4 to identify
 * enterprise workload patterns and provide actionable migration recommendations.
 */
export function scanWorkspaceDirectory(targetDir?: string): WorkspaceScanResult {
  const rootDir = targetDir ? targetDir : process.cwd()
  const markers: WorkspaceMarker[] = []
  let totalFilesScanned = 0
  let discoveredIngress: SampleIngress | undefined

  if (!existsSync(rootDir)) {
    return {
      targetDirectory: rootDir,
      detectedWorkloadType: 'app-modernization',
      detectedSourceTech: 'Application Monolith',
      totalFilesScanned: 0,
      markers: [],
      sampleIngressYaml: {
        path: 'synthetic://store-ingress.yaml',
        content: DEFAULT_FALLBACK_INGRESS,
      },
      recommendedRecipes: ['java-spring-boot-3', 'k8s-ingress-to-gateway-api'],
      recommendedSkills: ['mmb-app-modernization', 'mmb-ingress2gateway'],
    }
  }

  function walk(currentDir: string, depth: number): void {
    if (depth > 4) return
    let entries: string[] = []
    try {
      entries = readdirSync(currentDir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry) || entry.startsWith('.')) continue
      const fullPath = join(currentDir, entry)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        walk(fullPath, depth + 1)
      } else if (stat.isFile()) {
        totalFilesScanned++
        const relPath = relative(rootDir, fullPath)
        const lowerName = entry.toLowerCase()
        const ext = extname(entry).toLowerCase()

        // 1. Kubernetes Ingress & YAML
        if (ext === '.yaml' || ext === '.yml') {
          let hasIngress = false
          try {
            const content = readFileSync(fullPath, 'utf8')
            if (content.includes('kind: Ingress') || content.includes('networking.k8s.io')) {
              hasIngress = true
              markers.push({
                category: 'Kubernetes / Ingress',
                file: relPath,
                detail: `Kubernetes Ingress manifest: ${entry}`,
              })
              if (!discoveredIngress) {
                discoveredIngress = { path: relPath, content }
              }
            }
          } catch {}

          if (!hasIngress && markers.filter(m => m.category === 'Configuration / Manifest').length < 5) {
            markers.push({
              category: 'Configuration / Manifest',
              file: relPath,
              detail: `YAML configuration manifest: ${entry}`,
            })
          }
        }

        // 2. Java / Spring Boot
        if (lowerName === 'pom.xml') {
          markers.push({
            category: 'Java / Application',
            file: relPath,
            detail: 'Maven Project Object Model descriptor',
          })
        } else if (lowerName === 'build.gradle' || lowerName === 'build.gradle.kts') {
          markers.push({
            category: 'Java / Application',
            file: relPath,
            detail: 'Gradle build automation script',
          })
        } else if (ext === '.java') {
          if (markers.filter(m => m.category === 'Java / Application').length < 10) {
            markers.push({
              category: 'Java / Application',
              file: relPath,
              detail: `Java source file: ${entry}`,
            })
          }
        }

        // 3. Node.js / TypeScript
        if (lowerName === 'package.json') {
          markers.push({
            category: 'Node.js / TypeScript',
            file: relPath,
            detail: `Node.js package manifest: ${entry}`,
          })
        }

        // 4. Python
        if (lowerName === 'requirements.txt' || lowerName === 'pyproject.toml' || lowerName === 'pipfile') {
          markers.push({
            category: 'Python / Application',
            file: relPath,
            detail: `Python dependency descriptor: ${entry}`,
          })
        }

        // 5. .NET
        if (ext === '.csproj' || ext === '.sln' || lowerName.endsWith('.fsproj')) {
          markers.push({
            category: '.NET / Application',
            file: relPath,
            detail: `.NET solution/project manifest: ${entry}`,
          })
        }

        // 6. Database / SQL
        if (ext === '.sql' || ext === '.pls' || ext === '.pkb' || ext === '.pks') {
          markers.push({
            category: 'Database / SQL',
            file: relPath,
            detail: `Database SQL/PL-SQL script: ${entry}`,
          })
        }

        // 7. Data Pipelines / Analytics
        if (
          lowerName.includes('spark') ||
          lowerName.includes('hadoop') ||
          lowerName.includes('hive') ||
          ext === '.hql' ||
          (ext === '.py' && (lowerName.includes('dag') || lowerName.includes('etl') || lowerName.includes('pipeline')))
        ) {
          markers.push({
            category: 'Data Pipeline / Analytics',
            file: relPath,
            detail: `Data processing pipeline: ${entry}`,
          })
        }

        // 8. Infrastructure & Containers
        if (ext === '.tf' || ext === '.tfvars') {
          markers.push({
            category: 'Terraform / Infrastructure',
            file: relPath,
            detail: `Terraform IaC configuration: ${entry}`,
          })
        } else if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) {
          markers.push({
            category: 'Container / Packaging',
            file: relPath,
            detail: `Docker container build definition: ${entry}`,
          })
        }
      }
    }
  }

  walk(rootDir, 0)

  // Determine detectedWorkloadType and detectedSourceTech
  let k8sCount = 0
  let dbCount = 0
  let dataCount = 0
  let javaCount = 0
  let dotnetCount = 0
  let nodeCount = 0
  let pythonCount = 0

  for (const m of markers) {
    if (m.category.includes('Kubernetes')) k8sCount++
    else if (m.category.includes('Database')) dbCount++
    else if (m.category.includes('Data Pipeline')) dataCount++
    else if (m.category.includes('Java')) javaCount++
    else if (m.category.includes('.NET')) dotnetCount++
    else if (m.category.includes('Node.js')) nodeCount++
    else if (m.category.includes('Python')) pythonCount++
  }

  let detectedWorkloadType: 'database' | 'kubernetes' | 'data-pipeline' | 'app-modernization' = 'app-modernization'
  let detectedSourceTech = 'Application Monolith'

  if (k8sCount > 0 && k8sCount >= dbCount && k8sCount >= dataCount) {
    detectedWorkloadType = 'kubernetes'
    detectedSourceTech = 'Kubernetes Ingress'
  } else if (dbCount > 0 && dbCount >= dataCount) {
    detectedWorkloadType = 'database'
    detectedSourceTech = 'Oracle / SQL Database'
  } else if (dataCount > 0) {
    detectedWorkloadType = 'data-pipeline'
    detectedSourceTech = 'Hadoop / Spark Data Pipeline'
  } else if (javaCount > 0) {
    detectedWorkloadType = 'app-modernization'
    detectedSourceTech = 'Java / Spring Boot'
  } else if (dotnetCount > 0) {
    detectedWorkloadType = 'app-modernization'
    detectedSourceTech = '.NET Core / Framework'
  } else if (nodeCount > 0) {
    detectedWorkloadType = 'app-modernization'
    detectedSourceTech = 'TypeScript / Node.js'
  } else if (pythonCount > 0) {
    detectedWorkloadType = 'app-modernization'
    detectedSourceTech = 'Python / Application'
  }

  // Recommended recipes & skills
  const recommendedRecipes: string[] = []
  const recommendedSkills: string[] = []

  if (detectedWorkloadType === 'kubernetes') {
    recommendedRecipes.push('k8s-ingress-to-gateway-api')
    recommendedSkills.push('mmb-ingress2gateway')
  } else if (detectedWorkloadType === 'database') {
    recommendedRecipes.push('oracle-plsql-to-bigquery')
    recommendedSkills.push('mmb-oracle-bigquery', 'mmb-alloydb-vector')
  } else if (detectedWorkloadType === 'data-pipeline') {
    recommendedRecipes.push('pyspark-to-dataproc-serverless')
    recommendedSkills.push('mmb-legacy-detox')
  } else {
    if (detectedSourceTech.includes('Java')) {
      recommendedRecipes.push('java-spring-boot-3', 'java-cloud-run-containerization')
    } else if (detectedSourceTech.includes('.NET')) {
      recommendedRecipes.push('dotnet-core-cloud-run')
    } else {
      recommendedRecipes.push('java-spring-boot-3', 'java-cloud-run-containerization')
    }
    recommendedSkills.push('mmb-app-modernization')
  }

  return {
    targetDirectory: rootDir,
    detectedWorkloadType,
    detectedSourceTech,
    totalFilesScanned,
    markers,
    sampleIngressYaml: discoveredIngress ?? {
      path: 'sample://store-ingress.yaml',
      content: DEFAULT_FALLBACK_INGRESS,
    },
    recommendedRecipes,
    recommendedSkills,
  }
}
