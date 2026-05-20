import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { cards } from "./cards";

// N:N self-relation between cards: `blocked_card_id` is blocked by `blocker_card_id`.
export const cardBlockers = pgTable(
  "card_blockers",
  {
    blockedCardId: text("blocked_card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    blockerCardId: text("blocker_card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.blockedCardId, t.blockerCardId] }),
    index("card_blockers_blocker_idx").on(t.blockerCardId),
  ],
);

export const cardBlockersRelations = relations(cardBlockers, ({ one }) => ({
  blocked: one(cards, {
    fields: [cardBlockers.blockedCardId],
    references: [cards.id],
  }),
  blocker: one(cards, {
    fields: [cardBlockers.blockerCardId],
    references: [cards.id],
  }),
}));
