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
}

export function topicQuestion(
  topic: TrendTopic,
  subject = 'this item (`title`, `summary`, `evidence`)',
): string {
  return `Is ${subject} substantially about ${topic.label} — ${topic.definition}? A passing mention does not count.`
}
