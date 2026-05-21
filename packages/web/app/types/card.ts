import type { CardStatus } from '@claude-organizer/shared'

export type {
  Card,
  CardParent,
  CardStatus,
  CardSubtask
} from '@claude-organizer/shared'

export const cardStatusOrder: CardStatus[] = [
  'todo',
  'in_progress',
  'review',
  'done',
  'blocked'
]

export const cardStatusMeta: Record<
  CardStatus,
  { label: string, color: 'neutral' | 'info' | 'warning' | 'success' | 'error' }
> = {
  backlog: { label: 'Backlog', color: 'neutral' },
  todo: { label: 'To do', color: 'neutral' },
  in_progress: { label: 'In progress', color: 'info' },
  review: { label: 'Review', color: 'warning' },
  done: { label: 'Done', color: 'success' },
  blocked: { label: 'Blocked', color: 'error' }
}
