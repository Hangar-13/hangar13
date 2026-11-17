"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  USER_RESUME_BUCKET,
  USER_RESUME_MAX_BYTES,
  USER_RESUME_MIME_TYPES,
  type UserResume,
  type UserResumeMimeType,
} from "@/lib/user-resume";

type ResumeRow = {
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string | null;
  storage_path: string;
};

function toResume(row: ResumeRow): UserResume {
  return {
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    storagePath: row.storage_path,
  };
}

async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: "You must be logged in." as const, supabase, user: null };
  }
  return { supabase, user, error: null };
}

export async function getUserResume(
  targetUserId?: string
): Promise<{ resume: UserResume | null; error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { resume: null, error: auth.error ?? "You must be logged in." };

  const userId = targetUserId ?? auth.user.id;
  const { data, error } = await auth.supabase
    .from("user_resumes")
    .select("file_url, file_name, file_size, file_type, storage_path")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getUserResume:", error);
    return { resume: null, error: "Unable to load resume." };
  }
  return { resume: data ? toResume(data as ResumeRow) : null };
}

export async function saveUserResume(input: {
  storagePath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}): Promise<{ resume?: UserResume; error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error ?? "You must be logged in." };

  const fileName = input.fileName.trim().slice(0, 255);
  const storagePath = input.storagePath.trim();
  const fileType = input.fileType.trim();
  if (!fileName || !storagePath.startsWith(`${auth.user.id}/`)) {
    return { error: "Invalid resume file." };
  }
  if (
    !Number.isFinite(input.fileSize) ||
    input.fileSize <= 0 ||
    input.fileSize > USER_RESUME_MAX_BYTES
  ) {
    return { error: "Resume must be 10MB or smaller." };
  }
  if (!(USER_RESUME_MIME_TYPES as readonly string[]).includes(fileType)) {
    return { error: "Upload a PDF or Word document." };
  }

  const { data: existing } = await auth.supabase
    .from("user_resumes")
    .select("storage_path")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const {
    data: { publicUrl },
  } = auth.supabase.storage.from(USER_RESUME_BUCKET).getPublicUrl(storagePath);

  const { data, error } = await auth.supabase
    .from("user_resumes")
    .upsert(
      {
        user_id: auth.user.id,
        file_url: publicUrl,
        file_name: fileName,
        file_size: Math.round(input.fileSize),
        file_type: fileType as UserResumeMimeType,
        storage_path: storagePath,
      },
      { onConflict: "user_id" }
    )
    .select("file_url, file_name, file_size, file_type, storage_path")
    .single();

  if (error || !data) {
    console.error("saveUserResume:", error);
    return { error: error?.message ?? "Unable to save resume." };
  }

  const previousPath = (existing as { storage_path?: string } | null)?.storage_path;
  if (previousPath && previousPath !== storagePath) {
    await auth.supabase.storage.from(USER_RESUME_BUCKET).remove([previousPath]);
  }

  revalidatePath("/dashboard/student/skills");
  revalidatePath("/dashboard/student/prior-ojt");
  return { resume: toResume(data as ResumeRow) };
}

export async function removeUserResume(): Promise<{ error?: string }> {
  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error ?? "You must be logged in." };

  const { data: existing } = await auth.supabase
    .from("user_resumes")
    .select("storage_path")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const { error } = await auth.supabase
    .from("user_resumes")
    .delete()
    .eq("user_id", auth.user.id);

  if (error) {
    console.error("removeUserResume:", error);
    return { error: "Unable to remove resume." };
  }

  const previousPath = (existing as { storage_path?: string } | null)?.storage_path;
  if (previousPath) {
    await auth.supabase.storage.from(USER_RESUME_BUCKET).remove([previousPath]);
  }

  revalidatePath("/dashboard/student/skills");
  revalidatePath("/dashboard/student/prior-ojt");
  return {};
}
