/**
 * Locale dictionaries for MMB Migration Center UI.
 * @module @deepseek-ai/dsh-mmb-migration-workbench/client/locales
 */

export const NS = 'mmb'

export const en = {
  'trigger.title': 'Migration Center',
  'trigger.badge': '12 Blueprints',
  'workbench.title': 'MMB Migration Center Workbench',
  'workbench.subtitle': 'Enterprise Migration Blueprints, Workload Assessment, and Automated Refactoring Studio',
  'tab.portfolio': 'Curated Blueprints (12)',
  'tab.assessment': 'Workload Assessment',
  'tab.ingress': 'Ingress -> Gateway API',
  'tab.skills': 'Practitioner Skills (5)',
  'tab.recipes': 'Modernization Recipes (6)',
  'stats.total': 'Curated Blueprints',
  'stats.migrate': 'Database',
  'stats.modernize': 'Modernize',
  'stats.build': 'Cloud / Replatform',
  'stats.topTier': 'Production Ready',
  'filter.all': 'All Blueprints',
  'filter.search': 'Search curated blueprints by name, domain, or target GCP service...',
  'card.score': 'Score',
  'card.reality': 'Reality Check',
  'card.recommendation': 'Antigravity Roadmap',
  'card.services': 'Target GCP Services',
  'assess.title': 'Automated Workload Readiness Assessment',
  'assess.workloadType': 'Workload Type',
  'assess.sourcePlatform': 'Source Platform',
  'assess.sourceTech': 'Source Technology',
  'assess.run': 'Run Assessment',
  'assess.resultScore': 'Calibrated Feasibility Score',
  'assess.target': 'Recommended Target Architecture',
  'assess.actionPlan': 'Phased Execution Plan',
  'assess.risks': 'Identified Risk Factors',
  'ingress.title': 'Kubernetes Ingress to GKE Gateway API AST Translator',
  'ingress.loadSample': 'Load Sample Ingress',
  'ingress.translate': 'Translate to Gateway API',
  'ingress.copy': 'Copy Manifest',
  'ingress.copied': 'Copied!',
}

export type MmbKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    mmb: MmbKey
  }
}

export const zh: Record<MmbKey, string> = {
  'trigger.title': '迁移中心',
  'trigger.badge': '12个精选蓝图',
  'workbench.title': 'MMB 迁移工作台',
  'workbench.subtitle': '企业级迁移蓝图、工作负载评估与自动化代码重构工作室',
  'tab.portfolio': '精选蓝图 (12个)',
  'tab.assessment': '工作负载评估',
  'tab.ingress': 'Ingress 转 Gateway API',
  'tab.skills': '专家技能库 (5个)',
  'tab.recipes': '现代化配方 (6个)',
  'stats.total': '精选蓝图',
  'stats.migrate': '数据库',
  'stats.modernize': '应用现代化',
  'stats.build': '云重构',
  'stats.topTier': '生产就绪',
  'filter.all': '所有蓝图',
  'filter.search': '按名称、技术栈或 GCP 服务搜索精选蓝图...',
  'card.score': '校准评分',
  'card.reality': '实测评估',
  'card.recommendation': 'Antigravity 演进建议',
  'card.services': '目标 GCP 服务',
  'assess.title': '自动化工作负载迁移就绪评估',
  'assess.workloadType': '工作负载类型',
  'assess.sourcePlatform': '源平台',
  'assess.sourceTech': '源技术栈',
  'assess.run': '运行评估',
  'assess.resultScore': '校准可行性评分',
  'assess.target': '推荐目标架构',
  'assess.actionPlan': '分阶段执行计划',
  'assess.risks': '识别的风险要素',
  'ingress.title': 'Kubernetes Ingress 转 GKE Gateway API 转换器',
  'ingress.loadSample': '载入示例 Ingress',
  'ingress.translate': '转换为 Gateway API',
  'ingress.copy': '复制配置清单',
  'ingress.copied': '已复制！',
}
