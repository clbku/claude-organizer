import { describe, expect, it } from "vitest";
import {
  completeSprint,
  createSprint,
  getActiveSprint,
  getSprint,
  startSprint,
} from "../src/index";
import { freshProject, useTestDb } from "./helpers";

const ctx = useTestDb();

describe("sprint lifecycle", () => {
  it("allows only one active sprint per project: starting a second completes the first", async () => {
    const project = await freshProject(ctx.db);
    const s1 = await createSprint(ctx.db, { projectId: project.id, name: "S1" });
    const s2 = await createSprint(ctx.db, { projectId: project.id, name: "S2" });
    expect(s1.status).toBe("planned");
    expect(s2.status).toBe("planned");

    await startSprint(ctx.db, s1.id);
    expect((await getActiveSprint(ctx.db, project.id))?.id).toBe(s1.id);

    await startSprint(ctx.db, s2.id);
    const active = await getActiveSprint(ctx.db, project.id);
    expect(active?.id).toBe(s2.id);
    expect((await getSprint(ctx.db, s1.id))?.status).toBe("completed");
  });

  it("fills startsAt on start and endsAt on complete automatically", async () => {
    const project = await freshProject(ctx.db);
    const sprint = await createSprint(ctx.db, {
      projectId: project.id,
      name: "Dates",
    });
    expect(sprint.startsAt).toBeNull();
    expect(sprint.endsAt).toBeNull();

    const started = await startSprint(ctx.db, sprint.id);
    expect(started?.startsAt).toBeInstanceOf(Date);

    const completed = await completeSprint(ctx.db, sprint.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.endsAt).toBeInstanceOf(Date);
  });

  it("does not leak active sprints across projects", async () => {
    const p1 = await freshProject(ctx.db);
    const p2 = await freshProject(ctx.db);
    const s1 = await createSprint(ctx.db, { projectId: p1.id, name: "P1S" });
    await startSprint(ctx.db, s1.id);

    expect(await getActiveSprint(ctx.db, p2.id)).toBeNull();
    expect((await getActiveSprint(ctx.db, p1.id))?.id).toBe(s1.id);
  });
});
