"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Textarea } from "@/components/ui";
import { addStudyComment, resolveStudyComment } from "../actions";

export interface StudyCommentRow {
  id: string;
  parent_id: string | null;
  question_code: string | null;
  section_id: string | null;
  body: string;
  status: "open" | "resolved";
  author: string;
  created_at: string;
  resolved_by_name: string | null;
  resolved_at: string | null;
}

export function CommentsPanel({
  studyId,
  comments,
  questionCode,
  sectionId,
  canResolve,
}: {
  studyId: string;
  comments: StudyCommentRow[];
  questionCode?: string | null;
  sectionId?: string | null;
  canResolve: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => {
    if (questionCode !== undefined) return comments.filter((comment) => comment.question_code === questionCode);
    if (sectionId !== undefined) return comments.filter((comment) => comment.section_id === sectionId);
    return comments;
  }, [comments, questionCode, sectionId]);
  const roots = visible.filter((comment) => comment.parent_id === null);

  function submit(input: { body: string; parentId?: string; scopedQuestion?: string | null; scopedSection?: string | null }) {
    startTransition(async () => {
      setMessage(null);
      const result = await addStudyComment({
        studyId,
        body: input.body,
        parentId: input.parentId,
        questionCode: input.scopedQuestion === undefined ? questionCode ?? null : input.scopedQuestion,
        sectionId: input.scopedSection === undefined ? sectionId ?? null : input.scopedSection,
      });
      if (!result.ok) { setMessage(result.error); return; }
      setBody("");
      setReplyBody("");
      setReplyTo(null);
      router.refresh();
    });
  }

  const scopeLabel = questionCode !== undefined
    ? "question " + questionCode
    : sectionId !== undefined
      ? "section"
      : "study";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Textarea
          rows={2}
          placeholder={"Comment on " + scopeLabel + "…"}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-label="New comment"
          maxLength={4000}
        />
        <Button variant="secondary" disabled={pending || !body.trim()} onClick={() => submit({ body })}>Send</Button>
      </div>
      {message && <p role="alert" className="text-sm text-danger">{message}</p>}
      <ul className="space-y-3">
        {roots.map((comment) => {
          const replies = visible.filter((candidate) => candidate.parent_id === comment.id);
          return (
            <li key={comment.id} className="rounded-lg border border-line bg-surface-raised p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{comment.author}</span>
                {comment.question_code && <Badge>{comment.question_code}</Badge>}
                {comment.section_id && !comment.question_code && <Badge>Section</Badge>}
                <Badge tone={comment.status === "resolved" ? "green" : "amber"}>
                  {comment.status === "resolved" ? "Resolved" : "Open"}
                </Badge>
                <time className="text-xs text-muted">{formatTime(comment.created_at)}</time>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
              {comment.status === "resolved" && comment.resolved_by_name && (
                <p className="mt-1 text-xs text-muted">Resolved by {comment.resolved_by_name} · {formatTime(comment.resolved_at)}</p>
              )}
              <div className="mt-2 flex gap-2">
                <button className="text-xs text-accent underline" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>Reply</button>
                {canResolve && (
                  <button
                    className="text-xs text-accent underline"
                    disabled={pending}
                    onClick={() => startTransition(async () => {
                      const result = await resolveStudyComment(comment.id, comment.status !== "resolved");
                      if (!result.ok) setMessage(result.error);
                      else router.refresh();
                    })}
                  >
                    {comment.status === "resolved" ? "Reopen" : "Mark as resolved"}
                  </button>
                )}
              </div>
              {replyTo === comment.id && (
                <div className="mt-2 flex gap-2 border-l-2 border-accent/30 pl-3">
                  <Textarea rows={1} value={replyBody} onChange={(event) => setReplyBody(event.target.value)} aria-label="Reply" maxLength={4000} />
                  <Button size="sm" variant="secondary" disabled={pending || !replyBody.trim()} onClick={() => submit({
                    body: replyBody,
                    parentId: comment.id,
                    scopedQuestion: comment.question_code,
                    scopedSection: comment.section_id,
                  })}>Send reply</Button>
                </div>
              )}
              {replies.length > 0 && (
                <ul className="mt-3 space-y-2 border-l-2 border-line pl-3">
                  {replies.map((reply) => (
                    <li key={reply.id}>
                      <p className="whitespace-pre-wrap">{reply.body}</p>
                      <p className="text-xs text-muted">{reply.author} · {formatTime(reply.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {roots.length === 0 && <li className="text-sm text-muted">No comments.</li>}
      </ul>
    </div>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
