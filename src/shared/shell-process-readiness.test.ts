import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseDarwinExecutablePath,
  parseShellProcessReadiness,
  resolveShellExecutablePath
} from './shell-process-readiness'

describe('shell process readiness', () => {
  it('parses a foreground shell', () => {
    expect(parseShellProcessReadiness('Ss+  /bin/zsh\n')).toEqual({
      executablePath: '/bin/zsh',
      foreground: true
    })
  })

  it('preserves executable names containing spaces', () => {
    expect(
      parseShellProcessReadiness('S+  /Applications/Electron Helper.app/Electron Helper\n')
    ).toEqual({
      executablePath: '/Applications/Electron Helper.app/Electron Helper',
      foreground: true
    })
  })

  it('rejects missing process rows', () => {
    expect(parseShellProcessReadiness('')).toBeNull()
  })

  it('extracts the primary text image from macOS lsof output', () => {
    expect(parseDarwinExecutablePath('p42\nftxt\nn/bin/zsh\nftxt\nn/usr/lib/zsh/zle.so\n')).toBe(
      '/bin/zsh'
    )
  })

  it('resolves bare shell commands through the spawn PATH', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-shell-path-'))
    const link = join(root, 'shell-name')
    await symlink(process.execPath, link)
    try {
      await expect(resolveShellExecutablePath('shell-name', dirname(root), root)).resolves.toBe(
        await resolveShellExecutablePath(process.execPath, dirname(root), root)
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === 'win32')(
    'uses the POSIX exec default when PATH is unset',
    async () => {
      await expect(resolveShellExecutablePath('sh', process.cwd(), undefined)).resolves.toBe(
        await resolveShellExecutablePath('/bin/sh', process.cwd(), '')
      )
    }
  )

  it('resolves relative shell paths against the PTY cwd', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-relative-shell-'))
    const bin = join(root, 'bin')
    await symlink(dirname(process.execPath), bin)
    try {
      await expect(
        resolveShellExecutablePath(`./bin/${basename(process.execPath)}`, root, '')
      ).resolves.toBe(await resolveShellExecutablePath(process.execPath, root, ''))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips searchable directories that shadow a later PATH executable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-shadowed-shell-'))
    const first = join(root, 'first')
    const second = join(root, 'second')
    await mkdir(join(first, 'shell-name'), { recursive: true })
    await mkdir(second)
    await symlink(process.execPath, join(second, 'shell-name'))
    try {
      await expect(
        resolveShellExecutablePath('shell-name', root, `${first}:${second}`)
      ).resolves.toBe(await resolveShellExecutablePath(process.execPath, root, ''))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
