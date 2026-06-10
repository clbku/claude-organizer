// Importing the adapter module runs its top-level registerAiProvider side effect.
import '../src/aiClaudeCli'

import { afterEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_AI_PROVIDER,
  getAiExecutionService,
  resolveAiProviderName
} from '../src/aiExecution'

// start() is never called here on purpose: it would fork a real `claude -p`
// (the same reason the suite sets ENRICHMENT=off). These cover the wiring —
// registration, provider resolution, factory errors, cancel no-op.
describe('aiExecution factory', () => {
  const savedProvider = process.env.CO_AI_PROVIDER
  afterEach(() => {
    if (savedProvider === undefined) delete process.env.CO_AI_PROVIDER
    else process.env.CO_AI_PROVIDER = savedProvider
  })

  it('registers the claude-cli adapter under the default provider name', () => {
    const service = getAiExecutionService()
    expect(typeof service.start).toBe('function')
    expect(typeof service.cancel).toBe('function')
  })

  it('memoizes one instance per provider', () => {
    expect(getAiExecutionService()).toBe(getAiExecutionService(DEFAULT_AI_PROVIDER))
  })

  it('throws for an unregistered provider', () => {
    expect(() => getAiExecutionService('does-not-exist')).toThrow(/does-not-exist/)
  })

  it('resolves the provider name from arg, env, then default', () => {
    delete process.env.CO_AI_PROVIDER
    expect(resolveAiProviderName()).toBe(DEFAULT_AI_PROVIDER)
    expect(resolveAiProviderName('pinned')).toBe('pinned')
    process.env.CO_AI_PROVIDER = 'from-env'
    expect(resolveAiProviderName()).toBe('from-env')
    expect(resolveAiProviderName('pinned')).toBe('pinned')
  })

  it('cancel tolerates a null job id', () => {
    expect(() => getAiExecutionService().cancel(null)).not.toThrow()
  })
})
