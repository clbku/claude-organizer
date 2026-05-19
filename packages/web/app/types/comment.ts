export type CommentAuthor = "ai" | "user";

export interface Comment {
  id: string;
  cardId: string;
  author: CommentAuthor;
  bodyMd: string;
  readByAi: boolean;
  createdAt: string;
}
