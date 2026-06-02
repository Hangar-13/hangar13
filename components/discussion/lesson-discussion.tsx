"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Send,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  getLessonDiscussion,
  postDiscussionMessage,
  editDiscussionMessage,
  deleteDiscussionMessage,
  type DiscussionMessage,
  type DiscussionParticipant,
  type LessonDiscussionData,
} from "@/app/actions/lesson-discussion";

function initialsFor(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return (
    date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

interface LessonDiscussionProps {
  userTrainingId: string;
  lessonId: string;
  questions: string[];
  programWeek: number;
  initial: LessonDiscussionData | null;
  openQuestionIndex?: number | null;
}

export function LessonDiscussion({
  userTrainingId,
  lessonId,
  questions,
  programWeek,
  initial,
  openQuestionIndex,
}: LessonDiscussionProps) {
  const [messages, setMessages] = useState<DiscussionMessage[]>(
    initial?.messages ?? []
  );
  const [viewerId] = useState<string | null>(initial?.viewer_id ?? null);
  const [student] = useState<DiscussionParticipant | null>(
    initial?.student ?? null
  );
  const [mentor] = useState<DiscussionParticipant | null>(
    initial?.mentor ?? null
  );
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const s = new Set<number>();
    if (
      typeof openQuestionIndex === "number" &&
      openQuestionIndex >= 0 &&
      openQuestionIndex < questions.length
    ) {
      s.add(openQuestionIndex);
    }
    return s;
  });

  const questionRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  const mergeMessage = useCallback((incoming: DiscussionMessage) => {
    setMessages((prev) => {
      const normalized: DiscussionMessage = incoming.deleted_at
        ? { ...incoming, body: null }
        : incoming;
      const idx = prev.findIndex((m) => m.id === normalized.id);
      if (idx === -1) {
        return [...prev, normalized].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      const next = [...prev];
      next[idx] = { ...next[idx]!, ...normalized };
      return next;
    });
  }, []);

  // Realtime: pick up the other participant's messages / edits / deletes.
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    const channel = supabase
      .channel(`discussion:${userTrainingId}:${lessonId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lesson_discussion_messages",
          filter: `user_training_id=eq.${userTrainingId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | DiscussionMessage
            | undefined;
          if (!row || row.lesson_id !== lessonId) return;
          mergeMessage(row);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userTrainingId, lessonId, mergeMessage]);

  // Deep link: expand and scroll the target question into view once.
  useEffect(() => {
    if (
      typeof openQuestionIndex !== "number" ||
      openQuestionIndex < 0 ||
      openQuestionIndex >= questions.length
    ) {
      return;
    }
    const el = questionRefs.current.get(openQuestionIndex);
    if (el) {
      const t = setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [openQuestionIndex, questions.length]);

  const messagesByQuestion = useMemo(() => {
    const map = new Map<number, DiscussionMessage[]>();
    for (const m of messages) {
      const list = map.get(m.question_index) ?? [];
      list.push(m);
      map.set(m.question_index, list);
    }
    return map;
  }, [messages]);

  const toggle = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const participantFor = useCallback(
    (userId: string): DiscussionParticipant | null => {
      if (student && student.id === userId) return student;
      if (mentor && mentor.id === userId) return mentor;
      return null;
    },
    [student, mentor]
  );

  const refreshThread = useCallback(async () => {
    const data = await getLessonDiscussion(userTrainingId, lessonId);
    if (data) setMessages(data.messages);
  }, [userTrainingId, lessonId]);

  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No discussion questions defined for this week.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((question, index) => {
        const threadMessages = messagesByQuestion.get(index) ?? [];
        const visibleCount = threadMessages.filter((m) => !m.deleted_at).length;
        const isOpen = expanded.has(index);
        return (
          <div
            key={index}
            ref={(el) => {
              questionRefs.current.set(index, el);
            }}
            className="scroll-mt-24 overflow-hidden rounded-md ring-1 ring-black/[0.04]"
          >
            <button
              type="button"
              onClick={() => toggle(index)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                "bg-muted/15 hover:bg-muted/30",
                isOpen && "border-b border-border/25"
              )}
              aria-expanded={isOpen}
            >
              <span className="w-5 shrink-0 pt-0.5 text-sm font-medium tabular-nums text-muted-foreground">
                {index + 1}.
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                {question}
              </span>
              <span className="flex shrink-0 items-center gap-2 pt-0.5">
                {visibleCount > 0 ? (
                  <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {visibleCount}
                  </span>
                ) : null}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
            </button>

            {isOpen ? (
              <QuestionConversation
                userTrainingId={userTrainingId}
                lessonId={lessonId}
                questionIndex={index}
                questionText={question}
                programWeek={programWeek}
                messages={threadMessages}
                viewerId={viewerId}
                participantFor={participantFor}
                onLocalMerge={mergeMessage}
                onNeedsRefresh={refreshThread}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

interface QuestionConversationProps {
  userTrainingId: string;
  lessonId: string;
  questionIndex: number;
  questionText: string;
  programWeek: number;
  messages: DiscussionMessage[];
  viewerId: string | null;
  participantFor: (userId: string) => DiscussionParticipant | null;
  onLocalMerge: (m: DiscussionMessage) => void;
  onNeedsRefresh: () => void;
}

function QuestionConversation({
  userTrainingId,
  lessonId,
  questionIndex,
  questionText,
  programWeek,
  messages,
  viewerId,
  participantFor,
  onLocalMerge,
  onNeedsRefresh,
}: QuestionConversationProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = await postDiscussionMessage({
      userTrainingId,
      lessonId,
      questionIndex,
      questionText,
      programWeek,
      body,
    });
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDraft("");
    if (result.message) onLocalMerge(result.message);
    requestAnimationFrame(scrollToBottom);
  };

  const startEdit = (m: DiscussionMessage) => {
    setEditingId(m.id);
    setEditDraft(m.body ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async (m: DiscussionMessage) => {
    const body = editDraft.trim();
    if (!body) return;
    const result = await editDiscussionMessage({ messageId: m.id, body });
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.message) onLocalMerge(result.message);
    cancelEdit();
  };

  const handleDelete = async (m: DiscussionMessage) => {
    if (!confirm("Delete this message?")) return;
    const result = await deleteDiscussionMessage({ messageId: m.id });
    if (result.error) {
      setError(result.error);
      onNeedsRefresh();
      return;
    }
    if (result.message) onLocalMerge(result.message);
  };

  return (
    <div>
      <div
        ref={scrollRef}
        className="max-h-80 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No messages yet. Start the conversation below.
          </p>
        ) : (
          messages.map((m) => {
            const isOwn = viewerId != null && m.sender_user_id === viewerId;
            const sender = participantFor(m.sender_user_id);
            const isDeleted = m.deleted_at != null;
            const isEditing = editingId === m.id;
            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-end gap-2",
                  isOwn ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold",
                    isOwn
                      ? "bg-primary/20 text-foreground/80"
                      : "bg-muted/40 text-muted-foreground"
                  )}
                  title={sender?.full_name ?? undefined}
                >
                  {sender?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sender.avatar_url}
                      alt={sender.full_name ?? "User"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initialsFor(sender?.full_name)
                  )}
                </div>

                <div
                  className={cn(
                    "group max-w-[78%] min-w-0",
                    isOwn ? "items-end text-right" : "items-start text-left"
                  )}
                >
                  {!isOwn ? (
                    <p className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground">
                      {sender?.full_name ?? "Unknown"}
                    </p>
                  ) : null}

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        className="text-sm"
                        autoFocus
                      />
                      <div
                        className={cn(
                          "flex gap-1.5",
                          isOwn ? "justify-end" : "justify-start"
                        )}
                      >
                        <Button
                          size="sm"
                          className="h-7"
                          onClick={() => saveEdit(m)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={cancelEdit}
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "inline-block rounded-2xl px-3 py-2 text-sm",
                        isDeleted
                          ? "bg-muted/20 italic text-muted-foreground"
                          : isOwn
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/30 text-foreground",
                        isOwn ? "rounded-br-sm" : "rounded-bl-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words text-left">
                        {isDeleted ? "This message was deleted" : m.body}
                      </p>
                    </div>
                  )}

                  <div
                    className={cn(
                      "mt-0.5 flex items-center gap-1.5 px-1",
                      isOwn ? "justify-end" : "justify-start"
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {formatMessageTime(m.created_at)}
                      {!isDeleted && m.edited_at ? " · edited" : ""}
                    </span>
                    {isOwn && !isDeleted && !isEditing ? (
                      <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          aria-label="Edit message"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(m)}
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                          aria-label="Delete message"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-border/25 bg-muted/15 p-3">
        {error ? (
          <p className="mb-2 text-xs text-destructive">{error}</p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Write a message…"
            rows={1}
            className="max-h-32 min-h-9 flex-1 resize-none bg-background text-sm"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={sending || draft.trim().length === 0}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
