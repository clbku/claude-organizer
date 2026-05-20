import { z } from 'zod'

/**
 * Querystring flags arrive as strings; mirror the previous `=== 'true'`
 * semantics — only the literal `'true'` is true, anything else (incl. absent)
 * is false.
 */
export const queryBool = z
  .string()
  .optional()
  .transform(v => v === 'true')

/** Required project identifier on list endpoints scoped to a project. */
export const projectIdQuery = z.string().min(1)
