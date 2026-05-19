import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { docKindEnum } from "./enums";

export const docs = pgTable(
  "docs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => docs.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    summary: text("summary"),
    bodyMd: text("body_md"),
    kind: docKindEnum("kind").notNull().default("note"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("docs_project_idx").on(t.projectId),
    index("docs_parent_idx").on(t.parentId),
    index("docs_kind_idx").on(t.projectId, t.kind),
  ],
);

export const docsRelations = relations(docs, ({ one, many }) => ({
  project: one(projects, {
    fields: [docs.projectId],
    references: [projects.id],
  }),
  parent: one(docs, {
    fields: [docs.parentId],
    references: [docs.id],
    relationName: "doc_parent",
  }),
  children: many(docs, { relationName: "doc_parent" }),
}));
