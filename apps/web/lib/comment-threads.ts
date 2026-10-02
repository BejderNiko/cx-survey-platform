export type CommentThreadStatus = "open" | "resolved";
export type CommentThreadFilter = "all" | CommentThreadStatus;

export interface CommentThreadReference {
  id: string;
  parent_id: string | null;
  status: CommentThreadStatus;
}

export interface ScopedCommentReference {
  question_code: string | null;
  section_id: string | null;
}

export function commentsForScope<T extends ScopedCommentReference>(
  comments: T[],
  scope: { questionCode?: string | null; sectionId?: string | null },
): T[] {
  if (scope.questionCode != null) return comments.filter((comment) => comment.question_code === scope.questionCode);
  if (scope.sectionId != null) return comments.filter((comment) => comment.section_id === scope.sectionId && comment.question_code === null);
  return comments.filter((comment) => comment.question_code === null && comment.section_id === null);
}

export function filterCommentThreads<T extends CommentThreadReference>(comments: T[], filter: CommentThreadFilter): T[] {
  if (filter === "all") return comments;
  const rootIds = new Set(comments
    .filter((comment) => comment.parent_id === null && comment.status === filter)
    .map((comment) => comment.id));
  return comments.filter((comment) => comment.parent_id === null
    ? rootIds.has(comment.id)
    : rootIds.has(comment.parent_id));
}

export function countCommentThreads<T extends Pick<CommentThreadReference, "parent_id">>(comments: T[]): number {
  return comments.filter((comment) => comment.parent_id === null).length;
}

export function commentThreadHash(commentId: string): string {
  return `#comment-thread-${encodeURIComponent(commentId)}`;
}
