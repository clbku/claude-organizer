import type { Tag } from "~/types/tag";

export type CardStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

export interface Card {
  id: string;
  projectId: string;
  sprintId: string | null;
  key: string;
  title: string;
  summary: string | null;
  descriptionMd?: string | null;
  status: CardStatus;
  priority: number;
  dueDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
  parentId?: string | null;
  parentKey?: string | null;
  subtaskCount?: number;
  subtaskDone?: number;
  subtasks?: CardSubtask[];
  parent?: CardParent | null;
}

export interface CardSubtask {
  id: string;
  key: string;
  title: string;
  status: CardStatus;
  priority: number;
}

export interface CardParent {
  id: string;
  key: string;
  title: string;
  status: CardStatus;
}

export const cardStatusOrder: CardStatus[] = [
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
];

export const cardStatusMeta: Record<
  CardStatus,
  { label: string; color: "neutral" | "info" | "warning" | "success" | "error" }
> = {
  todo: { label: "To do", color: "neutral" },
  in_progress: { label: "In progress", color: "info" },
  review: { label: "Review", color: "warning" },
  done: { label: "Done", color: "success" },
  blocked: { label: "Blocked", color: "error" },
};
