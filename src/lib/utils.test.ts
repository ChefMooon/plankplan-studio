import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('combines conditional class values', () => {
    const hidden = false
    expect(cn('base', hidden ? 'hidden' : undefined, ['flex', { active: true }])).toBe('base flex active')
  })

  it('merges conflicting Tailwind utilities while keeping unrelated classes', () => {
    expect(cn('px-2 text-sm', 'px-4 text-lg font-medium')).toBe('px-4 text-lg font-medium')
  })
})
