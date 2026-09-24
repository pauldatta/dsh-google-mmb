/**
 * Ingress to Gateway API Translator.
 * Translates networking.k8s.io/v1 Ingress manifests into modern GKE
 * gateway.networking.k8s.io/v1 Gateway and HTTPRoute manifests.
 * Supports single-document manifests and multi-document YAML streams (---).
 *
 * @module @deepseek-ai/dsh-mmb-migration-workbench/ingress-translator
 */

import type { IngressTranslateRequest, IngressTranslateResult } from './types.ts'

interface ParsedRulePath {
  path: string
  pathType: 'Prefix' | 'Exact' | 'ImplementationSpecific'
  serviceName: string
  servicePort: number
}

interface ParsedRule {
  host?: string | undefined
  paths: ParsedRulePath[]
}

interface ParsedTls {
  hosts: string[]
  secretName: string
}

interface ParsedIngress {
  name: string
  namespace: string
  ingressClassName?: string | undefined
  annotations: Record<string, string>
  rules: ParsedRule[]
  tls: ParsedTls[]
}

function splitYamlDocuments(manifest: string): string[] {
  const rawDocs = manifest.split(/^(?:---|---[\t ].*)$/m)
  const validDocs = rawDocs
    .map(d => d.trim())
    .filter(d => d.length > 0 && !d.split('\n').every(l => l.trim().startsWith('#') || !l.trim()))
  return validDocs.length > 0 ? validDocs : [manifest]
}

/**
 * Lightweight deterministic YAML-to-Ingress parser and Gateway API generator.
 * Supports single Ingress manifests as well as multi-document YAML streams (---).
 */
export function translateIngressToGatewayApi(request: IngressTranslateRequest): IngressTranslateResult {
  const rawDocs = splitYamlDocuments(request.manifest)
  let ingressDocs = rawDocs.filter(d => {
    if (d.includes('kind:')) {
      return d.includes('kind: Ingress')
    }
    return true
  })
  if (ingressDocs.length === 0) {
    ingressDocs = rawDocs
  }

  const parsedList: ParsedIngress[] = ingressDocs.map(doc => parseIngressYaml(doc))
  const primaryParsed = parsedList[0] ?? {
    name: 'migrated-ingress',
    namespace: 'default',
    annotations: {},
    rules: [],
    tls: [],
  }

  const isMultiDoc = parsedList.length > 1
  const gatewayName = request.gatewayName ?? (isMultiDoc ? 'cluster-gateway' : `${primaryParsed.name}-gateway`)
  const gatewayNamespace = request.gatewayNamespace ?? primaryParsed.namespace ?? 'default'

  // Determine GatewayClass based on ingress class or annotations across all ingresses
  let gatewayClass = 'gke-l7-global-external-managed'
  const isAnyInternal = parsedList.some(parsed =>
    parsed.annotations['kubernetes.io/ingress.class'] === 'gke-internal'
    || parsed.ingressClassName === 'gke-internal'
    || parsed.annotations['networking.gke.io/v1.Ingress/load-balancer-type'] === 'Internal',
  )
  if (isAnyInternal) {
    gatewayClass = 'gke-l7-rilb'
  }

  // Cross-namespace check
  const crossNamespaceIngresses = parsedList.filter(p => (p.namespace || 'default') !== gatewayNamespace)
  const isCrossNamespace = crossNamespaceIngresses.length > 0
  const fromNamespace = isCrossNamespace ? 'All' : 'Same'

  // Aggregate listeners
  const listeners: string[] = []
  const tlsHosts: Set<string> = new Set()
  const seenListenerNames: Set<string> = new Set()

  listeners.push(`    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: ${fromNamespace}`)

  for (const parsed of parsedList) {
    for (const tls of parsed.tls) {
      if (!tls) continue
      for (const host of tls.hosts) {
        tlsHosts.add(host)
        const listenerName = `https-${host.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`
        if (seenListenerNames.has(listenerName)) continue
        seenListenerNames.add(listenerName)

        listeners.push(`    - name: ${listenerName}
      protocol: HTTPS
      port: 443
      hostname: ${host}
      tls:
        mode: Terminate
        certificateRefs:
          - kind: Secret
            group: ""
            name: ${tls.secretName}
      allowedRoutes:
        namespaces:
          from: ${fromNamespace}`)
      }
    }
  }

  const gatewayYaml = `apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: ${gatewayName}
  namespace: ${gatewayNamespace}
  labels:
    app.kubernetes.io/managed-by: dsh-mmb-migration-workbench
spec:
  gatewayClassName: ${gatewayClass}
  listeners:
${listeners.join('\n')}`

  // Generate HTTPRoutes for each parsed ingress
  const httpRouteYamls: string[] = []
  const allBackendServices: Set<string> = new Set()
  const allAnnotations: Set<string> = new Set()
  let totalRoutesCount = 0

  for (const parsed of parsedList) {
    for (const k of Object.keys(parsed.annotations)) {
      allAnnotations.add(k)
    }

    const routeNamespace = parsed.namespace || 'default'
    const httpRouteRules: string[] = []

    for (const rule of parsed.rules) {
      const ruleBlocks: string[] = []
      for (const p of rule.paths) {
        totalRoutesCount++
        allBackendServices.add(p.serviceName)
        const matchType = p.pathType === 'Exact' ? 'Exact' : 'PathPrefix'
        ruleBlocks.push(`    - matches:
        - path:
            type: ${matchType}
            value: "${p.path}"
      backendRefs:
        - name: ${p.serviceName}
          port: ${p.servicePort}
          weight: 1`)
      }

      if (ruleBlocks.length > 0) {
        httpRouteRules.push(ruleBlocks.join('\n'))
      }
    }

    const uniqueHosts = Array.from(
      new Set(parsed.rules.map(r => r.host).filter((h): h is string => Boolean(h && h.trim()))),
    )

    const hostnamesBlock = uniqueHosts.length > 0
      ? `  hostnames:\n${uniqueHosts.map(h => `    - "${h}"`).join('\n')}\n`
      : ''

    const singleRouteYaml = `apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${parsed.name}-route
  namespace: ${routeNamespace}
  labels:
    app.kubernetes.io/managed-by: dsh-mmb-migration-workbench
spec:
  parentRefs:
    - name: ${gatewayName}
      namespace: ${gatewayNamespace}
${hostnamesBlock}${httpRouteRules.length > 0 ? `  rules:\n${httpRouteRules.join('\n')}` : '  rules: []'}`

    httpRouteYamls.push(singleRouteYaml)
  }

  const httpRouteYaml = httpRouteYamls.join('\n---\n')

  // Generate ReferenceGrants for each distinct remote namespace
  const referenceGrantYamls: string[] = []
  const grantedNamespaces = new Set<string>()

  for (const parsed of crossNamespaceIngresses) {
    const ns = parsed.namespace || 'default'
    if (grantedNamespaces.has(ns)) continue
    grantedNamespaces.add(ns)

    referenceGrantYamls.push(`apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: ${gatewayName}-grant
  namespace: ${ns}
  labels:
    app.kubernetes.io/managed-by: dsh-mmb-migration-workbench
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: Gateway
      namespace: ${gatewayNamespace}
  to:
    - group: ""
      kind: Service`)
  }

  const referenceGrantYaml = referenceGrantYamls.length > 0 ? referenceGrantYamls.join('\n---\n') : undefined

  const sourceNameDesc = isMultiDoc
    ? `${parsedList.length} Ingresses (${parsedList.map(p => p.name).join(', ')})`
    : `${primaryParsed.name} (Namespace: ${primaryParsed.namespace || 'default'})`

  const combinedYamlParts = [
    '# ══════════════════════════════════════════════════════════════════════════════',
    '# GKE Gateway API Generated by MMB Migration Workbench',
    `# Source Ingress: ${sourceNameDesc}`,
    `# Target Gateway: ${gatewayName} (Namespace: ${gatewayNamespace})`,
    `# Target GatewayClass: ${gatewayClass}`,
    '# ══════════════════════════════════════════════════════════════════════════════',
    '',
    gatewayYaml,
    '---',
    httpRouteYaml,
  ]

  if (referenceGrantYaml) {
    combinedYamlParts.push('---', referenceGrantYaml)
  }

  const combinedYaml = combinedYamlParts.join('\n') + '\n'

  return {
    gatewayYaml,
    httpRouteYaml,
    referenceGrantYaml,
    combinedYaml,
    summary: {
      routesConverted: totalRoutesCount,
      tlsHosts: Array.from(tlsHosts),
      backendServices: Array.from(allBackendServices),
      annotationsHandled: Array.from(allAnnotations),
      crossNamespaceGrantGenerated: isCrossNamespace,
    },
  }
}

/**
 * Line-based Ingress manifest parser resilient to formatting variations.
 */
function parseIngressYaml(yaml: string): ParsedIngress {
  const lines = yaml.split(/\r?\n/)
  let name = 'migrated-ingress'
  let namespace = 'default'
  let ingressClassName: string | undefined
  const annotations: Record<string, string> = {}
  const rules: ParsedRule[] = []
  const tls: ParsedTls[] = []

  let inMetadata = false
  let inAnnotations = false
  let inSpec = false
  let inRules = false
  let inTls = false
  let inDefaultBackend = false
  let defaultBackend: { serviceName: string; servicePort: number } | null = null
  let currentRule: ParsedRule | null = null
  let currentPath: Partial<ParsedRulePath> | null = null
  let currentTls: Partial<ParsedTls> | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = line.search(/\S/)

    if (indent === 0) {
      inMetadata = trimmed.startsWith('metadata:')
      inSpec = trimmed.startsWith('spec:')
      inAnnotations = false
      inRules = false
      inTls = false
      inDefaultBackend = false
      continue
    }

    if (inMetadata) {
      if (indent === 2 && trimmed.startsWith('name:')) {
        name = trimmed.slice(5).trim().replace(/^['"]|['"]$/g, '')
      } else if (indent === 2 && trimmed.startsWith('namespace:')) {
        namespace = trimmed.slice(10).trim().replace(/^['"]|['"]$/g, '')
      } else if (indent === 2 && trimmed.startsWith('annotations:')) {
        inAnnotations = true
      } else if (inAnnotations && indent >= 4 && trimmed.includes(':')) {
        const colonIdx = trimmed.indexOf(':')
        const key = trimmed.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '')
        const val = trimmed.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '')
        annotations[key] = val
      }
    }

    if (inSpec) {
      if (indent === 2 && trimmed.startsWith('ingressClassName:')) {
        ingressClassName = trimmed.slice(17).trim().replace(/^['"]|['"]$/g, '')
      } else if (indent === 2 && (trimmed.startsWith('defaultBackend:') || trimmed.startsWith('backend:'))) {
        inDefaultBackend = true
        inRules = false
        inTls = false
        defaultBackend = { serviceName: 'default-backend', servicePort: 80 }
      } else if (indent === 2 && trimmed.startsWith('rules:')) {
        inRules = true
        inTls = false
        inDefaultBackend = false
      } else if (indent === 2 && trimmed.startsWith('tls:')) {
        inTls = true
        inRules = false
        inDefaultBackend = false
      }

      if (inDefaultBackend) {
        if (trimmed.startsWith('name:') || trimmed.startsWith('serviceName:')) {
          const svcName = trimmed.replace(/^(name|serviceName):\s*/, '').trim().replace(/^['"]|['"]$/g, '')
          if (defaultBackend) defaultBackend.serviceName = svcName
        } else if (trimmed.startsWith('number:') || trimmed.startsWith('servicePort:')) {
          const portStr = trimmed.replace(/^(number|servicePort):\s*/, '').trim()
          if (defaultBackend) defaultBackend.servicePort = Number.parseInt(portStr, 10) || 80
        }
      }

      if (inRules) {
        if (trimmed.startsWith('- host:') || (indent === 4 && trimmed.startsWith('host:'))) {
          const hostVal = trimmed.replace(/^-\s*host:\s*|^host:\s*/, '').trim().replace(/^['"]|['"]$/g, '')
          currentRule = { host: hostVal, paths: [] }
          rules.push(currentRule)
        } else if (trimmed.startsWith('- http:') || trimmed.startsWith('http:')) {
          if (!currentRule) {
            currentRule = { paths: [] }
            rules.push(currentRule)
          }
        } else if (trimmed.startsWith('- path:')) {
          const pathVal = trimmed.slice(7).trim().replace(/^['"]|['"]$/g, '')
          currentPath = {
            path: pathVal || '/',
            pathType: 'Prefix',
            serviceName: 'backend-svc',
            servicePort: 80,
          }
          if (currentRule) currentRule.paths.push(currentPath as ParsedRulePath)
        } else if (currentPath && trimmed.startsWith('pathType:')) {
          const pType = trimmed.slice(9).trim().replace(/^['"]|['"]$/g, '')
          currentPath.pathType = pType === 'Exact' ? 'Exact' : 'Prefix'
        } else if (currentPath && (trimmed.startsWith('name:') || trimmed.startsWith('serviceName:'))) {
          const svcName = trimmed.replace(/^(name|serviceName):\s*/, '').trim().replace(/^['"]|['"]$/g, '')
          currentPath.serviceName = svcName
        } else if (currentPath && (trimmed.startsWith('number:') || trimmed.startsWith('servicePort:'))) {
          const portStr = trimmed.replace(/^(number|servicePort):\s*/, '').trim()
          currentPath.servicePort = Number.parseInt(portStr, 10) || 80
        }
      }

      if (inTls) {
        if (trimmed.startsWith('- hosts:') || trimmed.startsWith('hosts:')) {
          currentTls = { hosts: [], secretName: 'tls-secret' }
          tls.push(currentTls as ParsedTls)
          const inlineMatch = trimmed.match(/hosts:\s*\[(.*)\]/)
          if (inlineMatch && inlineMatch[1] && currentTls.hosts) {
            const splitHosts = inlineMatch[1].split(',').map(h => h.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
            currentTls.hosts.push(...splitHosts)
          }
        } else if (currentTls && trimmed.startsWith('-') && !trimmed.startsWith('- hosts:')) {
          const host = trimmed.slice(1).trim().replace(/^['"]|['"]$/g, '')
          if (host && !trimmed.startsWith('- secretName:')) {
            if (currentTls.hosts) currentTls.hosts.push(host)
          }
        } else if (currentTls && (trimmed.startsWith('secretName:') || trimmed.startsWith('- secretName:'))) {
          currentTls.secretName = trimmed.replace(/^-?\s*secretName:\s*/, '').trim().replace(/^['"]|['"]$/g, '')
        }
      }
    }
  }

  // Fallback if no paths were parsed
  if (rules.length === 0 || rules.every(r => r.paths.length === 0)) {
    rules.push({
      paths: [
        {
          path: '/',
          pathType: 'Prefix',
          serviceName: defaultBackend?.serviceName ?? 'default-backend',
          servicePort: defaultBackend?.servicePort ?? 80,
        },
      ],
    })
  }

  return { name, namespace, ingressClassName, annotations, rules, tls }
}
