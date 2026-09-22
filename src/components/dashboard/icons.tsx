import type { ComponentType } from 'react'
import {
  Atom,
  Bot,
  Brain,
  CircleHelp,
  Dna,
  FileText,
  GraduationCap,
  Link,
  MessageSquare,
  Rocket,
  Shield,
  Stethoscope,
  BookOpen,
  Newspaper,
  Zap,
  TrendingUp,
  Layers,
  Sparkles,
  EyeOff,
} from 'lucide-react'
import { GithubIcon } from '@/components/ui/brand-icons'
import type { DataSource, TechCategory } from '@/lib/tech-categories'
import type { SignalReason } from '@/lib/signal-model'

/**
 * Real vector icons instead of emoji: emoji render as boxes on machines
 * without an emoji font and vary by platform. Categories are usually shown
 * as a colored dot; these icons are for the places a glyph helps (filters).
 */

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export const CATEGORY_ICONS: Record<TechCategory, Icon> = {
  ai: Brain,
  energy: Zap,
  biotech: Dna,
  robotics: Bot,
  web3: Link,
  quantum: Atom,
  space: Rocket,
  cybersecurity: Shield,
  uncategorized: CircleHelp,
}

export const SOURCE_ICONS: Record<DataSource, Icon> = {
  github: GithubIcon,
  arxiv: FileText,
  techcrunch: Newspaper,
  hackernews: MessageSquare,
  openalex: GraduationCap,
  pubmed: Stethoscope,
  hal: BookOpen,
  'openalex-zh': GraduationCap,
  cinii: BookOpen,
}

export const REASON_ICONS: Record<SignalReason, Icon> = {
  'fast-rising': TrendingUp,
  converging: Layers,
  novel: Sparkles,
  'under-the-radar': EyeOff,
}

export function CategoryIcon({
  category,
  className = 'w-3.5 h-3.5',
}: {
  category: TechCategory
  className?: string
}) {
  const I = CATEGORY_ICONS[category]
  return <I className={className} aria-hidden />
}

export function SourceIcon({
  source,
  className = 'w-3.5 h-3.5',
}: {
  source: DataSource
  className?: string
}) {
  const I = SOURCE_ICONS[source]
  return <I className={className} aria-hidden />
}

/** Small colored disc: the category mark used on rows and legends. */
export function CategoryDot({
  color,
  className = '',
}: {
  color: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${className}`}
      style={{ backgroundColor: color }}
    />
  )
}
