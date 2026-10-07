import { describe, expect, it } from 'vitest'
import { citabilityGaps, deriveCitable, type CitabilityInput } from './citability.js'

const pinned: CitabilityInput = {
  checkKind: 'command',
  requiresFixture: false,
  artifactVersion: 'v1.4.2',
  configCommit: 'a1b2c3d',
  fixtureVersion: null,
  paramsHash: 'sha256:9f8e',
}

describe('citability', () => {
  it('is citable when every required pin is present', () => {
    expect(deriveCitable(pinned)).toBe(true)
    expect(citabilityGaps(pinned)).toEqual([])
  })

  it('is not citable without an artifact version', () => {
    expect(deriveCitable({ ...pinned, artifactVersion: null })).toBe(false)
  })

  it('is not citable without a config commit', () => {
    expect(deriveCitable({ ...pinned, configCommit: '' })).toBe(false)
  })

  it('is not citable without a params hash', () => {
    expect(deriveCitable({ ...pinned, paramsHash: undefined })).toBe(false)
  })

  it('only requires a fixture version when the check requires a fixture', () => {
    expect(deriveCitable({ ...pinned, requiresFixture: true })).toBe(false)
    expect(
      deriveCitable({ ...pinned, requiresFixture: true, fixtureVersion: 'baseline-v2' }),
    ).toBe(true)
  })

  it('never treats a prompt run as citable, however well pinned', () => {
    const promptRun: CitabilityInput = { ...pinned, checkKind: 'prompt', fixtureVersion: 'f1' }
    expect(deriveCitable(promptRun)).toBe(false)
    expect(citabilityGaps(promptRun)[0]).toMatch(/not reproducible/)
  })

  it('reports every gap at once rather than the first', () => {
    const gaps = citabilityGaps({
      ...pinned,
      artifactVersion: null,
      configCommit: null,
      paramsHash: null,
    })
    expect(gaps).toHaveLength(3)
  })
})
