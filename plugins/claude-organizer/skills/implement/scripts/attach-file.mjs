#!/usr/bin/env node
// Upload a proof-of-work file to a card via the REST API's multipart route.
//
//   node scripts/attach-file.mjs <CO-N> <path>
//   pnpm attach-file <CO-N> <path>
//
// The file's bytes go straight from disk to the API over HTTP — they never pass
// through an AI context (no MCP, no tokens spent encoding base64). This is the
// fast path that replaced the old base64-over-MCP upload_card_attachment tool.
//
// Zero dependencies: standalone Node 18+ (global fetch / FormData / Blob). A
// Python twin lives at scripts/attach-file.py for machines without Node. Keep
// the two in sync.
//
// Config: CO_API_URL (default http://127.0.0.1:4400).

import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'

const API_URL = (process.env.CO_API_URL || 'http://127.0.0.1:4400').replace(/\/$/, '')

// Card-scoped token minted by the MCP (issue_commit_token); only needed when the
// API has auth on. Absent in sem-auth mode — then no extra header is sent.
const COMMIT_TOKEN = process.env.CO_COMMIT_TOKEN

function withToken(headers = {}) {
  return COMMIT_TOKEN
    ? { ...headers, 'X-CO-Commit-Token': COMMIT_TOKEN }
    : headers
}

// A small extension → MIME map covers the proof-of-work files seen in practice
// (screenshots, logs, pdfs). The server only special-cases images; anything
// unknown falls back to a generic binary type and is stored as-is.
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.log': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
}

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function main() {
  const [key, filePath] = process.argv.slice(2)
  if (!key || !filePath) {
    fail('usage: attach-file <CO-N> <path-to-file>')
  }

  let bytes
  try {
    bytes = readFileSync(filePath)
  } catch (err) {
    fail(`could not read ${filePath}: ${err.message}`)
  }

  const filename = basename(filePath)
  const mimeType
    = MIME_BY_EXT[extname(filename).toLowerCase()] || 'application/octet-stream'

  // fetch sets the multipart Content-Type (with boundary) from the FormData
  // body itself — never set it by hand, or the boundary won't match.
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mimeType }), filename)

  const res = await fetch(
    `${API_URL}/cards/by-key/${encodeURIComponent(key)}/attachments`,
    { method: 'POST', headers: withToken(), body: form }
  ).catch((err) => {
    fail(`could not reach the API at ${API_URL} (${err.message}). Is it running?`)
  })

  if (!res.ok) {
    const body = await res.text()
    fail(`API responded ${res.status}: ${body}`)
  }

  console.log(
    `✓ ${key} — ${filename} (${humanBytes(bytes.byteLength)}) → attached`
  )
}

main()
