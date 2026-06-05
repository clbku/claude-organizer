import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp
} from 'drizzle-orm/pg-core'

import { users } from './auth'
import { userRoleEnum, userStatusEnum } from './enums'
import { projects } from './projects'

// Authorization layer kept OUT of the better-auth tables (those follow its
// contract): role/status and per-project access live here, one row per user.
// `allProjects=true` grants every project including ones created later, so it is
// a flag rather than materialized rows. Admin role bypasses project scoping
// entirely (see core/authz).
export const userAuthz = pgTable('user_authz', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: userRoleEnum('role').notNull().default('user'),
  status: userStatusEnum('status').notNull().default('pending'),
  allProjects: boolean('all_projects').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
})

export const userProjectAccess = pgTable(
  'user_project_access',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
  },
  t => [primaryKey({ columns: [t.userId, t.projectId] })]
)

export const userAuthzRelations = relations(userAuthz, ({ one }) => ({
  user: one(users, { fields: [userAuthz.userId], references: [users.id] })
}))

export const userProjectAccessRelations = relations(
  userProjectAccess,
  ({ one }) => ({
    user: one(users, {
      fields: [userProjectAccess.userId],
      references: [users.id]
    }),
    project: one(projects, {
      fields: [userProjectAccess.projectId],
      references: [projects.id]
    })
  })
)
