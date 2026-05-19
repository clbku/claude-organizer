import { relations, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { sprints } from "./sprints";

export const roadmaps = pgTable(
  "roadmaps",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index("roadmaps_project_idx").on(t.projectId)],
);

export const roadmapsRelations = relations(roadmaps, ({ one, many }) => ({
  project: one(projects, {
    fields: [roadmaps.projectId],
    references: [projects.id],
  }),
  sprints: many(sprints),
}));
