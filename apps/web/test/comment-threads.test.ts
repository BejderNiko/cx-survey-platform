import { describe, expect, it } from "vitest";
import { commentThreadHash, commentsForScope, countCommentThreads, filterCommentThreads } from "../lib/comment-threads";

const comments = [
  { id: "open-root", parent_id: null, status: "open" as const },
  { id: "open-reply", parent_id: "open-root", status: "open" as const },
  { id: "resolved-root", parent_id: null, status: "resolved" as const },
  { id: "resolved-reply", parent_id: "resolved-root", status: "open" as const },
];

describe("comment thread triage", () => {
  it("filters by root status and keeps matching replies with their thread", () => {
    expect(filterCommentThreads(comments, "open").map(({ id }) => id)).toEqual(["open-root", "open-reply"]);
    expect(filterCommentThreads(comments, "resolved").map(({ id }) => id)).toEqual(["resolved-root", "resolved-reply"]);
    expect(filterCommentThreads(comments, "all")).toEqual(comments);
  });

  it("counts discussion threads, not individual replies", () => {
    expect(countCommentThreads(comments)).toBe(2);
  });

  it("keeps study, section, and question conversations at their own anchors", () => {
    const scoped = [
      { id: "study", question_code: null, section_id: null },
      { id: "section", question_code: null, section_id: "block-1" },
      { id: "question", question_code: "q1", section_id: "block-1" },
    ];
    expect(commentsForScope(scoped, {}).map(({ id }) => id)).toEqual(["study"]);
    expect(commentsForScope(scoped, { sectionId: "block-1" }).map(({ id }) => id)).toEqual(["section"]);
    expect(commentsForScope(scoped, { questionCode: "q1" }).map(({ id }) => id)).toEqual(["question"]);
  });

  it("creates stable, URL-safe thread fragments", () => {
    expect(commentThreadHash("cmt-123")).toBe("#comment-thread-cmt-123");
    expect(commentThreadHash("id with space")).toBe("#comment-thread-id%20with%20space");
  });
});
