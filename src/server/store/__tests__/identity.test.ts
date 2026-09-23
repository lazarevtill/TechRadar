import { describe, it, expect } from 'vitest'
import {
  groupByKeys,
  identityKeys,
  keysFromText,
  keysFromUrl,
} from '../identity'

describe('keysFromUrl', () => {
  it('recognises the same arXiv paper on every host, without version', () => {
    for (const url of [
      'https://arxiv.org/abs/2609.24976v2',
      'http://arxiv.org/pdf/2609.24976',
      'https://www.alphaxiv.org/abs/2609.24976',
      'https://huggingface.co/papers/2609.24976',
    ])
      expect(keysFromUrl(url)).toEqual(['arxiv:2609.24976'])
  })
  it('extracts repos, models and DOIs', () => {
    expect(keysFromUrl('https://github.com/Foo/Bar-Baz.git/tree/main')).toEqual(
      ['github:foo/bar-baz'],
    )
    expect(keysFromUrl('https://huggingface.co/Qwen/Qwen-Image-2.1')).toEqual([
      'hf:qwen/qwen-image-2.1',
    ])
    expect(keysFromUrl('https://doi.org/10.1101/2026.09.20.1234')).toEqual([
      'doi:10.1101/2026.09.20.1234',
    ])
    expect(
      keysFromUrl(
        'https://www.biorxiv.org/content/10.1101/2026.09.20.612345v1',
      ),
    ).toEqual(['doi:10.1101/2026.09.20.612345'])
  })
  it('canonicalizes other links and ignores discussion pages', () => {
    expect(keysFromUrl('https://www.Example.com/post/?utm=x#top')).toEqual([
      'url:example.com/post',
    ])
    expect(keysFromUrl('https://news.ycombinator.com/item?id=1')).toEqual([])
    // Pages that do not name one work give no key.
    for (const url of [
      'https://github.com',
      'https://github.com/someuser',
      'https://huggingface.co/someorg',
      'https://arxiv.org/list/cs.AI/new',
      'https://example.com/',
    ])
      expect(keysFromUrl(url)).toEqual([])
    // The query is identity when it names the resource; tracking is dropped.
    expect(keysFromUrl('https://youtube.com/watch?v=A&utm_source=x')).toEqual([
      'url:youtube.com/watch?v=A',
    ])
    expect(keysFromUrl('https://youtube.com/watch?v=B')).toEqual([
      'url:youtube.com/watch?v=B',
    ])
    expect(keysFromUrl('https://a.dev/p?b=2&a=1&fbclid=z')).toEqual([
      'url:a.dev/p?a=1&b=2',
    ])
    // A topic listing is not one work.
    expect(keysFromUrl('https://github.com/topics/llm')).toEqual([])
    expect(keysFromUrl('not a url')).toEqual([])
  })
})

describe('keysFromText', () => {
  it('finds explicit references, not bare numbers', () => {
    const keys = keysFromText(
      'Code for arXiv:2609.11111. See https://github.com/a/b. In 2025.1234 we…',
    )
    expect(keys.sort()).toEqual(['arxiv:2609.11111', 'github:a/b'])
  })
})

describe('identityKeys + groupByKeys', () => {
  it('links a paper, its HF page, its repo and an HN post about the repo', () => {
    const items = [
      {
        id: 'arxiv-2609.24976',
        sourceUrl: 'https://arxiv.org/abs/2609.24976v1',
      },
      {
        id: 'hfp-2609.24976',
        sourceUrl: 'https://huggingface.co/papers/2609.24976',
      },
      {
        id: 'gh-1',
        sourceUrl: 'https://github.com/lab/wm',
        summary: 'Official code for arXiv:2609.24976',
      },
      { id: 'hn-9', sourceUrl: 'https://github.com/lab/wm' },
      { id: 'hn-10', sourceUrl: 'https://example.com/unrelated' },
    ]
    const keys = new Map(items.map((i) => [i.id, identityKeys(i)]))
    const groups = groupByKeys(keys)
    const g = groups.get('arxiv-2609.24976')
    expect(
      ['hfp-2609.24976', 'gh-1', 'hn-9'].map((id) => groups.get(id)),
    ).toEqual([g, g, g])
    expect(groups.get('hn-10')).toBe('hn-10')
  })

  it('takes identifiers the source published (refs)', () => {
    expect(
      identityKeys({
        id: 'hfm-org/model',
        sourceUrl: 'https://huggingface.co/org/model',
        refs: ['arxiv:2609.11111', 'https://github.com/Lab/Code.git'],
      }).sort(),
    ).toEqual(['arxiv:2609.11111', 'github:lab/code', 'hf:org/model'])
  })
})
