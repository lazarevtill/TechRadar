export const SOURCE_META = {
  anthropic: { label: 'Anthropic' },
  openai: { label: 'OpenAI' },
  'latent-space': { label: 'Latent Space' },
  deepmind: { label: 'Google DeepMind' },
  simonw: { label: 'Simon Willison' },
  hf: { label: 'Hugging Face' },
  meta: { label: 'Meta AI' },
  mistral: { label: 'Mistral' },
}

export function pickDigestText(item, lang) {
  const block = (item && item[lang]) ||
    (item && item.en) || { headline: '', tweets: [] }
  return {
    headline: block.headline || '',
    tweets: Array.isArray(block.tweets) ? block.tweets : [],
  }
}
