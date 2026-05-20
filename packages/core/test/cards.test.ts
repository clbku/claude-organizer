import { describe, expect, it } from "vitest";
import {
  createCard,
  createSprint,
  getCard,
  moveCardToBacklog,
  moveCardToSprint,
  updateCard,
} from "../src/index";
import { freshProject, useTestDb } from "./helpers";

const ctx = useTestDb();

describe("card key generation", () => {
  it("assigns sequential keys per project prefix", async () => {
    const project = await freshProject(ctx.db, "CO");
    const a = await createCard(ctx.db, { projectId: project.id, title: "first" });
    const b = await createCard(ctx.db, { projectId: project.id, title: "second" });
    expect(a.key).toBe("CO-1");
    expect(b.key).toBe("CO-2");
  });

  it("is atomic under concurrency: no duplicates, contiguous sequence", async () => {
    const project = await freshProject(ctx.db, "AT");
    const n = 25;
    const cards = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        createCard(ctx.db, { projectId: project.id, title: `c${i}` }),
      ),
    );
    const nums = cards
      .map((c) => Number(c.key.split("-")[1]))
      .sort((x, y) => x - y);
    expect(new Set(cards.map((c) => c.key)).size).toBe(n);
    expect(nums).toEqual(Array.from({ length: n }, (_, i) => i + 1));
  });

  it("keeps a separate sequence per project", async () => {
    const p1 = await freshProject(ctx.db, "AA");
    const p2 = await freshProject(ctx.db, "BB");
    const c1 = await createCard(ctx.db, { projectId: p1.id, title: "x" });
    const c2 = await createCard(ctx.db, { projectId: p2.id, title: "y" });
    expect(c1.key).toBe("AA-1");
    expect(c2.key).toBe("BB-1");
  });
});

describe("moving cards between backlog and sprint", () => {
  it("moves a backlog card into a sprint and back", async () => {
    const project = await freshProject(ctx.db);
    const sprint = await createSprint(ctx.db, {
      projectId: project.id,
      name: "S1",
    });
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: "movable",
    });
    expect(card.sprintId).toBeNull();

    const moved = await moveCardToSprint(ctx.db, card.id, sprint.id);
    expect(moved?.sprintId).toBe(sprint.id);

    const back = await moveCardToBacklog(ctx.db, card.id);
    expect(back?.sprintId).toBeNull();
  });

  it("changes status", async () => {
    const project = await freshProject(ctx.db);
    const card = await createCard(ctx.db, {
      projectId: project.id,
      title: "status",
    });
    expect(card.status).toBe("todo");

    await updateCard(ctx.db, { id: card.id, status: "in_progress" });
    const reloaded = await getCard(ctx.db, card.id);
    expect(reloaded?.status).toBe("in_progress");
  });
});
