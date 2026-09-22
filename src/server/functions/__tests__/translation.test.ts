import { describe, it, expect } from 'vitest'
import { detectLanguage } from '../translation'

describe('detectLanguage', () => {
  it('reads CJK, Hangul and Cyrillic from the script', () => {
    expect(detectLanguage('基于深度学习的图像识别方法')).toBe('zh')
    expect(detectLanguage('深層学習による画像認識の手法')).toBe('ja')
    expect(detectLanguage('딥러닝 기반 이미지 인식')).toBe('ko')
    expect(detectLanguage('Распознавание изображений')).toBe('ru')
  })

  it('keeps short English titles English even with ambiguous words', () => {
    expect(detectLanguage('Show HN: A de facto standard for la carte')).toBe(
      'en',
    )
    expect(detectLanguage('acme/llm-tools: fast inference for LLMs')).toBe('en')
    expect(detectLanguage('Notes on the state of the art')).toBe('en')
  })

  it('detects Latin-script languages from several function words', () => {
    expect(
      detectLanguage(
        'Une méthode pour la détection des anomalies dans les réseaux',
      ),
    ).toBe('fr')
    expect(
      detectLanguage('Ein neues Verfahren für die Erkennung von Anomalien'),
    ).toBe('de')
    expect(
      detectLanguage('Un método para la detección de anomalías en las redes'),
    ).toBe('es')
    expect(
      detectLanguage('Um método para a detecção de anomalias em redes não'),
    ).toBe('pt')
  })

  it('needs at least two markers before leaving English', () => {
    expect(detectLanguage('GPT et al.')).toBe('en')
    expect(detectLanguage('')).toBe('en')
  })
})
