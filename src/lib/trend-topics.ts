/**
 * Tracked trend topics, shared by the daily digest pipeline (topic momentum)
 * and the live feed (cross-source convergence). `definition` is what Jev
 * judges an item against — one yes/no question per topic, so an item can
 * carry several. No zod, no runtime deps: safe to import from client code.
 */
export interface TrendTopic {
  label: string
  category: string
  stage: string
  definition: string
}

export const TOPIC_LABELS: Record<string, TrendTopic> = {
  'llm-agents': {
    label: 'LLM Agents',
    category: 'ai',
    stage: 'prototype',
    definition:
      'AI agents built on language models: agent frameworks, agentic workflows, models calling tools or acting autonomously',
  },
  rag: {
    label: 'Retrieval-Augmented Generation',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'Retrieval-augmented generation: grounding language model answers in retrieved documents, vector databases, embeddings for retrieval',
  },
  'open-models': {
    label: 'Open Models',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'Open-weight AI models (e.g. Llama, Mistral, Qwen, Gemma): releasing, fine-tuning, or running openly available model weights',
  },
  'post-quantum': {
    label: 'Post-Quantum Crypto',
    category: 'cybersecurity',
    stage: 'research',
    definition:
      'Post-quantum cryptography: encryption or signatures designed to resist quantum computers, such as lattice-based schemes',
  },
  'quantum-hardware': {
    label: 'Quantum Hardware',
    category: 'quantum',
    stage: 'research',
    definition:
      'Quantum computing hardware: qubits, quantum processors, building or scaling quantum computers',
  },
  humanoids: {
    label: 'Humanoid Robots',
    category: 'robotics',
    stage: 'prototype',
    definition:
      'Humanoid robots: human-shaped robots such as Tesla Optimus, Boston Dynamics Atlas, or Figure',
  },
  fusion: {
    label: 'Fusion Energy',
    category: 'energy',
    stage: 'research',
    definition:
      'Nuclear fusion energy: tokamaks, stellarators, plasma confinement, fusion power plants',
  },
  'protein-design': {
    label: 'Protein Design',
    category: 'biotech',
    stage: 'research',
    definition:
      'Protein structure prediction and protein design, such as AlphaFold or designing new proteins with AI',
  },
  'ai-chips': {
    label: 'AI Chips',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'Hardware built to train or run AI models: GPUs, TPUs, NPUs, inference accelerators, AI data-center chips',
  },
  'small-models': {
    label: 'Small & Efficient Models',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'Making AI models smaller or cheaper to run: on-device models, quantization, distillation, sparse or low-bit models',
  },
  multimodal: {
    label: 'Multimodal Models',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'AI models that combine vision, audio or video with language: vision-language models, speech models, video understanding',
  },
  'generative-media': {
    label: 'Generative Media',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'AI that generates images, video, 3D or music: diffusion models, text-to-image, text-to-video, world models',
  },
  'ai-safety': {
    label: 'AI Safety & Interpretability',
    category: 'ai',
    stage: 'research',
    definition:
      'Making AI systems safe or understandable: alignment, safety evaluations, red-teaming, jailbreaks, interpretability of model internals',
  },
  'ai-coding': {
    label: 'AI for Coding',
    category: 'ai',
    stage: 'early-adopter',
    definition:
      'AI that writes, reviews or fixes software: coding assistants, code-generation models, AI software-engineering agents',
  },
  'robot-learning': {
    label: 'Robot Learning',
    category: 'robotics',
    stage: 'prototype',
    definition:
      'Robots that learn behaviour from data: robot foundation models, vision-language-action models, learned manipulation or locomotion',
  },
  'autonomous-vehicles': {
    label: 'Autonomous Vehicles & Drones',
    category: 'robotics',
    stage: 'early-adopter',
    definition:
      'Vehicles that drive or fly themselves: self-driving cars, robotaxis, autonomous drones',
  },
  'gene-editing': {
    label: 'Gene Editing',
    category: 'biotech',
    stage: 'prototype',
    definition:
      'Editing or replacing genes: CRISPR, base or prime editing, gene therapy',
  },
  'ai-drug-discovery': {
    label: 'AI Drug Discovery',
    category: 'biotech',
    stage: 'prototype',
    definition:
      'Using computation or AI to discover or design drugs: molecule generation, virtual screening, AI-designed therapeutics',
  },
  batteries: {
    label: 'Batteries & Storage',
    category: 'energy',
    stage: 'early-adopter',
    definition:
      'Storing energy: battery chemistry (solid-state, sodium-ion, lithium), battery manufacturing, grid-scale storage',
  },
  'clean-power': {
    label: 'Clean Power & Grid',
    category: 'energy',
    stage: 'early-adopter',
    definition:
      'Generating or moving low-carbon electricity: solar, wind, geothermal, advanced fission, power grids and transmission',
  },
  satellites: {
    label: 'Satellites & Launch',
    category: 'space',
    stage: 'early-adopter',
    definition:
      'Getting to and operating in orbit: rockets and launch vehicles, satellite constellations, satellite internet, Earth observation',
  },
  'supply-chain-security': {
    label: 'Software Supply-Chain Security',
    category: 'cybersecurity',
    stage: 'early-adopter',
    definition:
      'Attacks on or defences of software dependencies and build pipelines: malicious packages, compromised libraries, code signing, SBOMs',
  },
  'exploited-vulnerabilities': {
    label: 'Exploited Vulnerabilities',
    category: 'cybersecurity',
    stage: 'mass-market',
    definition:
      'Security flaws being exploited in the wild: zero-days, ransomware campaigns, actively exploited CVEs and breaches',
  },
  'onchain-finance': {
    label: 'On-chain Finance',
    category: 'web3',
    stage: 'early-adopter',
    definition:
      'Financial systems built on blockchains: stablecoins, DeFi protocols, tokenized assets, on-chain payments',
  },
}

/**
 * Changes whenever the topic set does. Caches of per-item topic judgments
 * key on it, so adding or editing a topic re-judges items instead of serving
 * verdicts that never saw the new question.
 */
export const TOPIC_FINGERPRINT = (() => {
  const text = JSON.stringify(
    Object.entries(TOPIC_LABELS).map(([id, t]) => [id, t.definition]),
  )
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
})()

export function topicQuestion(
  topic: TrendTopic,
  subject = 'this item (`title`, `summary`, `evidence`)',
): string {
  return `Is ${subject} substantially about ${topic.label} — ${topic.definition}? A passing mention does not count.`
}

/**
 * A theme the radar added by itself (server/store/discovery.ts): a term that
 * burst across sources and that Jev confirmed names a technology. Its id,
 * `auto:<term>`, appears in `item.signal.topics` like a tracked topic's.
 */
export interface DiscoveredTheme {
  id: string
  label: string
  /** UTC day it was added. */
  addedDay: string
  /** Items in the current feed carrying it. */
  items: number
}

/** Display name for a topic id: tracked topics first, then discovered ones. */
export function topicLabel(
  id: string,
  discovered: DiscoveredTheme[] = [],
): string {
  return (
    TOPIC_LABELS[id]?.label ??
    discovered.find((t) => t.id === id)?.label ??
    id.replace(/^auto:/, '')
  )
}
