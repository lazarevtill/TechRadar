// Tech Evolution Radar - Category & Maturity Definitions

import type { SignalMetrics } from './signal-model'

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
  | 'openalex' // Most-cited recent peer-reviewed work (OpenAlex)
  | 'pubmed' // Biomedical research
  | 'hal' // French research archive
  | 'openalex-zh' // Chinese-language journal research (OpenAlex)
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
  /** Ranking, highlight reasons and their inputs (src/lib/signal-model.ts). */
  signal: SignalMetrics
  publishedAt: Date
  whyItMatters?: string
  // Multilingual support
  originalLanguage: OriginalLanguage
  citationCount?: number // For academic papers
  translations?: {
    en?: TranslatedContent
    ru?: TranslatedContent
  }
}

/**
 * Display colors. Category and maturity colors encode data (radar dots, the
 * category mark on a feed row); everything else in the UI is neutral. They
 * are muted on purpose so a page full of them still reads calmly.
 */
export const MATURITY_CONFIG: Record<
  MaturityStage,
  {
    label: string
    color: string
    description: string
  }
> = {
  research: {
    label: 'Research',
    color: '#b39ddb',
    description: 'Academic papers and theoretical foundations',
  },
  prototype: {
    label: 'Prototype',
    color: '#80cbc4',
    description: 'Working demos and proof-of-concepts',
  },
  'early-adopter': {
    label: 'Early adopter',
    color: '#ffcc80',
    description: 'Production use by innovators',
  },
  'mass-market': {
    label: 'Mass market',
    color: '#a5d6a7',
    description: 'Widespread industry adoption',
  },
}

export const CATEGORY_CONFIG: Record<
  TechCategory,
  {
    label: string
    color: string
  }
> = {
  ai: { label: 'AI / ML', color: '#c792ea' },
  energy: { label: 'Energy', color: '#7ec699' },
  biotech: { label: 'BioTech', color: '#6cc7d1' },
  robotics: { label: 'Robotics', color: '#e8a86b' },
  web3: { label: 'Web3', color: '#9aa6f5' },
  quantum: { label: 'Quantum', color: '#e08fb5' },
  space: { label: 'Space', color: '#7fb0e8' },
  cybersecurity: { label: 'Security', color: '#e07c7c' },
  uncategorized: { label: 'Unclassified', color: '#8a8a90' },
}

export const SOURCE_CONFIG: Record<
  DataSource,
  {
    label: string
    language?: OriginalLanguage
  }
> = {
  github: { label: 'GitHub', language: 'en' },
  arxiv: { label: 'arXiv', language: 'en' },
  techcrunch: { label: 'TechCrunch', language: 'en' },
  hackernews: { label: 'Hacker News', language: 'en' },
  openalex: { label: 'OpenAlex', language: 'en' },
  pubmed: { label: 'PubMed', language: 'en' },
  hal: { label: 'HAL (France)', language: 'fr' },
  'openalex-zh': { label: 'OpenAlex (China)', language: 'zh' },
  cinii: { label: 'CiNii (Japan)', language: 'ja' },
}
