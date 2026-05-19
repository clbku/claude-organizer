import { relations, sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { roadmaps } from "./roadmaps";
import { sprints } from "./sprints";
import { cards } from "./cards";
import { tags } from "./tags";
import { docs } from "./docs";

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    keyPrefix: text("key_prefix").notNull(),
    nextKeySeq: integer("next_key_seq").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [uniqueIndex("projects_slug_uk").on(t.slug)],
);

export const projectsRelations = relations(projects, ({ many }) => ({
  roadmaps: many(roadmaps),
  sprints: many(sprints),
  cards: many(cards),
  tags: many(tags),
  docs: many(docs),
}));
