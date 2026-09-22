// Tech Evolution Radar - Category & Maturity Definitions

export type MaturityStage =
  'research' | 'prototype' | 'early-adopter' | 'mass-market'

export type TechCategory =
  | 'ai'
  | 'energy'
  | 'biotech'
  | 'robotics'
  | 'web3'
  | 'quantum'
  | 'space'
  | 'cybersecurity'
  // No category judgment was available (TypeSafe key missing or the call failed)
  | 'uncategorized'

export type DataSource =
  | 'github'
  | 'arxiv'
  | 'techcrunch'
  | 'hackernews'
  | 'semantic-scholar' // High-citation academic papers
  | 'pubmed' // Biomedical research
  | 'hal' // French research archive
  | 'cnki' // Chinese research
  | 'cinii' // Japanese research

export type OriginalLanguage =
  | 'en'
  | 'zh' // Chinese
  | 'ja' // Japanese
  | 'fr' // French
  | 'de' // German
  | 'es' // Spanish
  | 'ru' // Russian
  | 'ko' // Korean
  | 'pt' // Portuguese

export interface TranslatedContent {
  title: string
  summary: string
  whyItMatters?: string
}

export interface TechItem {
  id: string
  title: string
  summary: string
  source: DataSource
  sourceUrl: string
  category: TechCategory
  maturityStage: MaturityStage
  impactScore: number // 1-10
  hypeVolume: number // mentions/engagement
  publishedAt: Date
  evolutionChainId?: string
  whyItMatters?: string
  isAnomaly?: boolean
  weeklyGrowth?: number // percentage
  // Multilingual support
  originalLanguage: OriginalLanguage
  citationCount?: number // For academic papers
  translations?: {
    en?: TranslatedContent
    ru?: TranslatedContent
  }
}

export interface EvolutionChain {
  id: string
  name: string
  description: string
  category: TechCategory
  items: string[] // TechItem IDs
  currentStage: MaturityStage
  trajectory: 'rising' | 'stable' | 'declining'
  createdAt: Date
}

export const MATURITY_CONFIG: Record<
  MaturityStage,
  {
    label: string
    color: string
    bgColor: string
    description: string
  }
> = {
  research: {
    label: 'Research',
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.15)',
    description: 'Academic papers and theoretical foundations',
  },
  prototype: {
    label: 'Prototype',
    color: '#00f0ff',
    bgColor: 'rgba(0, 240, 255, 0.15)',
    description: 'Working demos and proof-of-concepts',
  },
  'early-adopter': {
    label: 'Early Adopter',
    color: '#ffaa00',
    bgColor: 'rgba(255, 170, 0, 0.15)',
    description: 'Production use by innovators',
  },
  'mass-market': {
    label: 'Mass Market',
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.15)',
    description: 'Widespread industry adoption',
  },
}

export const CATEGORY_CONFIG: Record<
  TechCategory,
  {
    label: string
    icon: string
    color: string
  }
> = {
  ai: { label: 'AI / ML', icon: '🧠', color: '#ff00aa' },
  energy: { label: 'Energy', icon: '⚡', color: '#22c55e' },
  biotech: { label: 'BioTech', icon: '🧬', color: '#06b6d4' },
  robotics: { label: 'Robotics', icon: '🤖', color: '#f97316' },
  web3: { label: 'Web3', icon: '🔗', color: '#8b5cf6' },
  quantum: { label: 'Quantum', icon: '⚛️', color: '#ec4899' },
  space: { label: 'Space', icon: '🚀', color: '#3b82f6' },
  cybersecurity: { label: 'Security', icon: '🛡️', color: '#ef4444' },
  uncategorized: { label: 'Unclassified', icon: '❔', color: '#71717a' },
}

export const SOURCE_CONFIG: Record<
  DataSource,
  {
    label: string
    icon: string
    color: string
    language?: OriginalLanguage
  }
> = {
  github: { label: 'GitHub', icon: '📦', color: '#f0f6fc', language: 'en' },
  arxiv: { label: 'arXiv', icon: '📄', color: '#b31b1b', language: 'en' },
  techcrunch: {
    label: 'TechCrunch',
    icon: '📰',
    color: '#0a9e01',
    language: 'en',
  },
  hackernews: {
    label: 'Hacker News',
    icon: '🔶',
    color: '#ff6600',
    language: 'en',
  },
  'semantic-scholar': {
    label: 'Semantic Scholar',
    icon: '🎓',
    color: '#1857b6',
    language: 'en',
  },
  pubmed: { label: 'PubMed', icon: '🏥', color: '#326599', language: 'en' },
  hal: { label: 'HAL (France)', icon: '🇫🇷', color: '#003366', language: 'fr' },
  cnki: { label: 'CNKI (China)', icon: '🇨🇳', color: '#c41e3a', language: 'zh' },
  cinii: {
    label: 'CiNii (Japan)',
    icon: '🇯🇵',
    color: '#bc002d',
    language: 'ja',
  },
}
