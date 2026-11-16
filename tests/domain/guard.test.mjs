import { spawnSync } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('guard script', () => {
  it('rejects planted unsafe source and contract bypasses', async () => {
    const probePath = 'src/domain/.guard-probe.ts'
    const run = () => spawnSync(process.execPath, ['scripts/guard.mjs'], { encoding: 'utf8' }).status
    try {
      await writeFile(probePath, 'eval("1")')
      expect(run()).not.toBe(0)
    } finally {
      await unlink(probePath).catch(() => undefined)
    }
    expect(run()).toBe(0)
    for (const probe of ['const n = Date.now', 'xs.map(Math.random)', 'const t = setTimeout', 'const t = setInterval', 'new Function', 'import(`${x}`)']) {
      try {
        await writeFile(probePath, probe)
        expect(run(), probe).not.toBe(0)
      } finally {
        await unlink(probePath).catch(() => undefined)
      }
    }
  })
})
