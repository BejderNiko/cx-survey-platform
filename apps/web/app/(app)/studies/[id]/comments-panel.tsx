"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Textarea } from "@/components/ui";
import { commentThreadHash, commentsForScope, filterCommentThreads, type CommentThreadFilter } from "@/lib/comment-threads";
import { addStudyComment, deleteStudyComment, resolveStudyComment, updateStudyComment } from "../actions";

export interface StudyCommentRow {
  id: string;
  parent_id: string | null;
  question_code: string | null;
  section_id: string | null;
  body: string;
  status: "open" | "resolved";
  author: string;
  author_id: string;
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
  currentUserId,
}: {
  studyId: string;
  comments: StudyCommentRow[];
  questionCode?: string | null;
  sectionId?: string | null;
  canResolve: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [threadFilter, setThreadFilter] = useState<CommentThreadFilter>("all");
  const [pending, startTransition] = useTransition();
  const visible = useMemo(() => commentsForScope(comments, { questionCode, sectionId }), [comments, questionCode, sectionId]);
  const roots = filterCommentThreads(visible, threadFilter).filter((comment) => comment.parent_id === null);
  const openCount = visible.filter((comment) => comment.parent_id === null && comment.status === "open").length;
  const resolvedCount = visible.filter((comment) => comment.parent_id === null && comment.status === "resolved").length;
  const scope = questionCode ? `Question ${questionCode}` : sectionId ? "Section" : "Study";

  useEffect(() => {
    const hash = window.location.hash;
    const match = /^#comment-thread-([0-9a-f-]{36})$/i.exec(hash);
    if (!match) return;
    const commentId = match[1];
    const target = document.getElementById(`comment-thread-${commentId}`);
    if (!target) return;
    const details = target.closest("details");
    if (details) details.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [visible]);

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

  function edit(commentId: string) {
    startTransition(async () => {
      setMessage(null);
      const result = await updateStudyComment(commentId, editingBody);
      if (!result.ok) { setMessage(result.error); return; }
      setEditingId(null);
      setEditingBody("");
      router.refresh();
    });
  }

  function remove(commentId: string) {
    if (!window.confirm("Delete this comment?")) return;
    startTransition(async () => {
      setMessage(null);
      const result = await deleteStudyComment(commentId);
      if (!result.ok) { setMessage(result.error); return; }
      router.refresh();
    });
  }

  async function copyThreadLink(commentId: string) {
    const link = new URL(window.location.href);
    link.hash = commentThreadHash(commentId);
    try {
      await navigator.clipboard.writeText(link.toString());
      setMessage("Thread link copied.");
    } catch {
      setMessage("Could not copy link. Check browser clipboard access.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">{scope} discussion</p>
        <div className="flex gap-1" role="group" aria-label="Filter comment threads">
          {(["all", "open", "resolved"] as const).map((filter) => {
            const count = filter === "all" ? openCount + resolvedCount : filter === "open" ? openCount : resolvedCount;
            return <button key={filter} type="button" aria-pressed={threadFilter === filter} onClick={() => setThreadFilter(filter)} className={`rounded-md px-2 py-1 text-[11px] ${threadFilter === filter ? "bg-slate-200 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-100"}`}>
              {filter === "all" ? "All" : filter === "open" ? "Open" : "Resolved"} <span className="tabular-nums">{count}</span>
            </button>;
          })}
        </div>
      </div>
      <div className="flex gap-2">
        <Textarea
          rows={2}
          placeholder={`Add a comment to ${scope.toLowerCase()}…`}
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
            <li id={`comment-thread-${comment.id}`} key={comment.id} className="rounded-lg border border-line bg-surface-raised p-3 text-sm scroll-mt-24">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{comment.author}</span>
                {comment.question_code && <Badge>{comment.question_code}</Badge>}
                {comment.section_id && !comment.question_code && <Badge>Section</Badge>}
                <Badge tone={comment.status === "resolved" ? "green" : "amber"}>
                  {comment.status === "resolved" ? "Resolved" : "Open"}
                </Badge>
                <time className="text-xs text-muted">{formatTime(comment.created_at)}</time>
              </div>
              {editingId === comment.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea rows={2} value={editingBody} onChange={(event) => setEditingBody(event.target.value)} aria-label="Edit comment" maxLength={4000} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={pending || !editingBody.trim()} onClick={() => edit(comment.id)}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditingBody(""); }}>Cancel</Button>
                  </div>
                </div>
              ) : <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>}
              {comment.status === "resolved" && comment.resolved_by_name && (
                <p className="mt-1 text-xs text-muted">Resolved by {comment.resolved_by_name} · {formatTime(comment.resolved_at)}</p>
              )}
              <div className="mt-2 flex gap-2">
                <button type="button" className="text-xs text-accent underline" onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}>Reply</button>
                <button type="button" className="text-xs text-accent underline" onClick={() => void copyThreadLink(comment.id)}>Copy link</button>
                {comment.author_id === currentUserId && (
                  <>
                    <button type="button" className="text-xs text-accent underline" onClick={() => { setEditingId(comment.id); setEditingBody(comment.body); }}>Edit</button>
                    <button type="button" className="text-xs text-danger underline" disabled={pending} onClick={() => remove(comment.id)}>Delete</button>
                  </>
                )}
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
        {roots.length === 0 && <li className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-sm text-muted">{threadFilter === "all" ? `No comments on this ${scope.toLowerCase()} yet.` : `No ${threadFilter} threads.`}</li>}
      </ul>
    </div>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
