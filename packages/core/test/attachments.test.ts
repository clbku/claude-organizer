import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  attachmentsDir,
  createAttachment,
  createCard,
  InputError
} from '../src/index'
import { freshProject, useTestDb } from './helpers'

const ctx = useTestDb()

// A deterministic gradient compresses to a non-trivial JPEG (a solid color is
// too small to truncate mid-scan), so cutting its tail yields a genuinely
// incomplete image — the exact shape of the MCP base64-truncation bug.
function gradientRaw(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 3)
  let i = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      buf[i++] = (x * 2) & 255
      buf[i++] = (y * 2) & 255
      buf[i++] = (x + y) & 255
    }
  }
  return buf
}

function makeJpeg(size: number): Promise<Buffer> {
  return sharp(gradientRaw(size), {
    raw: { width: size, height: size, channels: 3 }
  })
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function freshCard(projectId: string) {
  return createCard(ctx.db, { projectId, title: 'attach target' })
}

describe('createAttachment image integrity', () => {
  it('stores a complete image intact and fully decodable', async () => {
    const project = await freshProject(ctx.db)
    const card = await freshCard(project.id)
    const full = await makeJpeg(600)

    const row = await createAttachment(ctx.db, {
      cardId: card.id,
      filename: 'shot.jpg',
      mimeType: 'image/jpeg',
      bytes: full
    })

    const stored = await readFile(path.join(attachmentsDir(), row.storagePath))
    // failOn:'error' throws if the stored file is truncated/gray-corrupt.
    const meta = await sharp(stored, { failOn: 'error' }).metadata()
    expect(meta.width).toBe(600)
    expect(meta.height).toBe(600)
  })

  it('rejects a truncated image instead of saving a gray-filled one', async () => {
    const project = await freshProject(ctx.db)
    const card = await freshCard(project.id)
    const full = await makeJpeg(600)
    const truncated = Buffer.from(full.subarray(0, Math.floor(full.byteLength * 0.3)))

    await expect(
      createAttachment(ctx.db, {
        cardId: card.id,
        filename: 'shot.jpg',
        mimeType: 'image/jpeg',
        bytes: truncated
      })
    ).rejects.toBeInstanceOf(InputError)
  })
})
