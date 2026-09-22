import { describe, it, expect } from 'vitest'
import { detectLanguage } from '../detect-language.js'

describe('detectLanguage', () => {
  it('reads CJK and Cyrillic from the script', () => {
    expect(detectLanguage('基于深度学习的图像识别方法')).toBe('zh')
    expect(detectLanguage('深層学習による画像認識')).toBe('ja')
    expect(detectLanguage('Распознавание изображений')).toBe('ru')
  })
  it('keeps English titles English', () => {
    expect(detectLanguage('acme/tool: a de facto standard for la carte')).toBe(
      'en',
    )
    expect(detectLanguage('')).toBe('en')
    expect(detectLanguage(null)).toBe('en')
  })
  it('detects French from several function words', () => {
    expect(
      detectLanguage(
        'Une méthode pour la détection des anomalies dans les réseaux',
      ),
    ).toBe('fr')
  })
})
