import { relations, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { roadmaps } from "./roadmaps";
import { cards } from "./cards";
import { sprintStatusEnum } from "./enums";

export const sprints = pgTable(
  "sprints",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    roadmapId: text("roadmap_id").references(() => roadmaps.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    goal: text("goal"),
    status: sprintStatusEnum("status").notNull().default("planned"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("sprints_project_idx").on(t.projectId),
    index("sprints_status_idx").on(t.projectId, t.status),
  ],
);

export const sprintsRelations = relations(sprints, ({ one, many }) => ({
  project: one(projects, {
    fields: [sprints.projectId],
    references: [projects.id],
  }),
  roadmap: one(roadmaps, {
    fields: [sprints.roadmapId],
    references: [roadmaps.id],
  }),
  cards: many(cards),
}));
