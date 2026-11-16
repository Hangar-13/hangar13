"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { removeUserResume, saveUserResume } from "@/app/actions/user-resume";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-browser";
import {
  USER_RESUME_BUCKET,
  USER_RESUME_MAX_BYTES,
  resumeExtension,
  resumeMimeForFile,
  type UserResume,
} from "@/lib/user-resume";

export function UserResumeField({
  initialResume,
  emptyHint = "PDF or Word, up to 10MB.",
}: {
  initialResume: UserResume | null;
  emptyHint?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [resume, setResume] = useState<UserResume | null>(initialResume);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onFile(file: File) {
    const mime = resumeMimeForFile(file);
    if (!mime) {
      setError("Upload a PDF or Word document.");
      return;
    }
    if (file.size > USER_RESUME_MAX_BYTES) {
      setError("Resume must be 10MB or smaller.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in to upload a resume.");
        return;
      }

      const storagePath = `${user.id}/${crypto.randomUUID()}.${resumeExtension(mime)}`;
      const { error: uploadError } = await supabase.storage
        .from(USER_RESUME_BUCKET)
        .upload(storagePath, file, { contentType: mime, upsert: false });

      if (uploadError) {
        setError(`Failed to upload resume: ${uploadError.message}`);
        return;
      }

      const result = await saveUserResume({
        storagePath,
        fileName: file.name,
        fileSize: file.size,
        fileType: mime,
      });
      if (result.error || !result.resume) {
        await supabase.storage.from(USER_RESUME_BUCKET).remove([storagePath]);
        setError(result.error ?? "Unable to save resume.");
        return;
      }

      setResume(result.resume);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to upload resume.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onRemove() {
    setPending(true);
    setError(null);
    try {
      const result = await removeUserResume();
      if (result.error) {
        setError(result.error);
        return;
      }
      setResume(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2" data-tour="skills-resume">
      <p className="text-sm font-medium text-foreground">Resume</p>
      {resume ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={resume.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{resume.fileName}</span>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onRemove}
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {resume ? "Replace resume" : "Upload resume"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
