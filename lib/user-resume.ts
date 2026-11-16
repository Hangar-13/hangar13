export const USER_RESUME_BUCKET = "user-resumes";
export const USER_RESUME_MAX_BYTES = 10 * 1024 * 1024;

export const USER_RESUME_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type UserResumeMimeType = (typeof USER_RESUME_MIME_TYPES)[number];

const EXTENSION_MIME: Record<string, UserResumeMimeType> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type UserResume = {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string | null;
  storagePath: string;
};

export function resumeMimeForFile(file: { name: string; type: string }): UserResumeMimeType | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fromExt = EXTENSION_MIME[ext];
  if (fromExt) return fromExt;
  if ((USER_RESUME_MIME_TYPES as readonly string[]).includes(file.type)) {
    return file.type as UserResumeMimeType;
  }
  return null;
}

export function resumeExtension(mime: UserResumeMimeType): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/msword") return "doc";
  return "docx";
}
