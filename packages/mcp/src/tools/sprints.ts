import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  completeSprint,
  createSprint,
  getActiveSprint,
  listSprints,
  startSprint,
} from "@claude-organizer/core";
import type { Database } from "@claude-organizer/db";
import { asJson } from "./index";

export function registerSprintTools(server: McpServer, db: Database) {
  server.tool(
    "list_sprints",
    "List sprints of a project.",
    { projectId: z.string() },
    async ({ projectId }) => asJson(await listSprints(db, projectId)),
  );

  server.tool(
    "get_active_sprint",
    "Get the currently active sprint of a project, if any.",
    { projectId: z.string() },
    async ({ projectId }) => asJson(await getActiveSprint(db, projectId)),
  );

  server.tool(
    "create_sprint",
    "Create a planned sprint (status=planned).",
    {
      projectId: z.string(),
      roadmapId: z.string().optional(),
      name: z.string().min(1).max(120),
      goal: z.string().max(500).optional(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
    },
    async (input) =>
      asJson(
        await createSprint(db, {
          ...input,
          startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
          endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        }),
      ),
  );

  server.tool(
    "start_sprint",
    "Activate a sprint. Any currently active sprint in the same project is auto-completed.",
    { sprintId: z.string() },
    async ({ sprintId }) => asJson(await startSprint(db, sprintId)),
  );

  server.tool(
    "complete_sprint",
    "Mark a sprint as completed.",
    { sprintId: z.string() },
    async ({ sprintId }) => asJson(await completeSprint(db, sprintId)),
  );
}
