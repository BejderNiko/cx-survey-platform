"use client";

import { useEffect, useRef } from "react";
import { CommentsPanel, type StudyCommentRow } from "../comments-panel";

export function ResultCommentPopover({
  studyId,
  questionCode,
  comments,
  canResolve,
  currentUserId,
}: {
  studyId: string;
  questionCode: string;
  comments: StudyCommentRow[];
  canResolve: boolean;
  currentUserId: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const count = comments.filter((comment) => comment.question_code === questionCode).length;
  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (detailsRef.current?.open && event.target instanceof Node && !detailsRef.current.contains(event.target)) {
        detailsRef.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, []);
  return (
    <details ref={detailsRef} className="relative inline-block align-middle">
      <summary className="ml-2 inline-flex h-7 cursor-pointer list-none items-center rounded-md bg-slate-100 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-200" aria-label={"Comment on " + questionCode}>
        Comment{count > 0 ? " · " + count : ""}
      </summary>
      <div className="absolute right-0 top-8 z-50 w-[min(440px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
        <CommentsPanel studyId={studyId} comments={comments} questionCode={questionCode} canResolve={canResolve} currentUserId={currentUserId} />
      </div>
    </details>
  );
}
