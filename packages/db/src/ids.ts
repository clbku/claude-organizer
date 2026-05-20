import { customAlphabet } from 'nanoid'

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
const generate = customAlphabet(alphabet, 12)

export const idPrefixes = {
  project: 'prj',
  roadmap: 'rdm',
  sprint: 'spr',
  card: 'crd',
  comment: 'cmt',
  tag: 'tag',
  doc: 'doc'
} as const

export type IdPrefix = (typeof idPrefixes)[keyof typeof idPrefixes]

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${generate()}`
}
