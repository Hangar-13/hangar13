"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { submitWeeklyReflection } from "@/app/actions/weekly-submission";
import { createClient } from "@/lib/supabase-browser";
import { Send, Upload, X, File as FileIcon, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeeklySubmissionFormProps {
  weekNumber: number;
  initialData?: {
    reflectionText: string;
    files: Array<{
      id: string;
      file_url: string;
      file_name: string;
      file_size: number;
      file_type: string | null;
    }>;
  };
}

interface FileWithPreview extends File {
  preview?: string;
}

interface ExistingFile {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string | null;
}

export function WeeklySubmissionForm({
  weekNumber,
  initialData,
}: WeeklySubmissionFormProps) {
  const router = useRouter();
  const [reflectionText, setReflectionText] = useState(initialData?.reflectionText || "");
  const [newFiles, setNewFiles] = useState<FileWithPreview[]>([]);
  const [existingFiles, setExistingFiles] = useState<ExistingFile[]>(
    initialData?.files.map(f => ({
      id: f.id,
      url: f.file_url,
      name: f.file_name,
      size: f.file_size,
      type: f.file_type,
    })) || []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setReflectionText(initialData.reflectionText || "");
      setExistingFiles(
        initialData.files.map(f => ({
          id: f.id,
          url: f.file_url,
          name: f.file_name,
          size: f.file_size,
          type: f.file_type,
        }))
      );
    }
  }, [initialData]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    
    // Validate file count (existing + new)
    if (existingFiles.length + newFiles.length + selectedFiles.length > 5) {
      setError("Maximum 5 files allowed. Please remove some files first.");
      return;
    }

    // Validate file sizes and add previews for images
    const validFiles: FileWithPreview[] = [];
    for (const file of selectedFiles) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`File ${file.name} exceeds 10MB limit.`);
        continue;
      }
      
      const fileWithPreview: FileWithPreview = file;
      if (file.type.startsWith("image/")) {
        fileWithPreview.preview = URL.createObjectURL(file);
      }
      validFiles.push(fileWithPreview);
    }

    setNewFiles((prev) => [...prev, ...validFiles]);
    setError(null);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeNewFile = (index: number) => {
    const file = newFiles[index];
    if (file.preview) {
      URL.revokeObjectURL(file.preview);
    }
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  };

  const removeExistingFile = (id: string) => {
    setExistingFiles((prev) => prev.filter((f) => f.id !== id));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reflectionText.trim()) {
      setError("Please write a reflection before submitting.");
      return;
    }

    if (reflectionText.length > 1000) {
      setError("Reflection text must be 1000 characters or less.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload new files to Supabase storage first
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setError("You must be logged in to submit.");
        setIsSubmitting(false);
        return;
      }

      const uploadedFileUrls: Array<{
        url: string;
        fileName: string;
        fileSize: number;
        fileType: string;
      }> = [];

      // Upload new files
      for (const file of newFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${weekNumber}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `weekly-submissions/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("weekly-submissions")
          .upload(filePath, file, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("weekly-submissions").getPublicUrl(filePath);

        uploadedFileUrls.push({
          url: publicUrl,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });
      }

      // Add existing files that weren't removed
      for (const file of existingFiles) {
        uploadedFileUrls.push({
          url: file.url,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type || "",
        });
      }

      // Call server action with all file URLs
      const result = await submitWeeklyReflection({
        weekNumber,
        reflectionText: reflectionText.trim(),
        fileUrls: uploadedFileUrls,
      });

      if (result.error) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      // Clean up new file preview URLs
      newFiles.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });

      // Redirect to training page on success
      router.push(`/dashboard/student/training?week=${weekNumber}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while submitting.");
      setIsSubmitting(false);
    }
  };

  const characterCount = reflectionText.length;
  const remainingChars = 1000 - characterCount;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Reflection Section */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Your Reflection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reflection" className="text-base font-medium">
              How did this week's training apply to your actual work?
            </Label>
            <p className="text-sm text-muted-foreground">
              Reflect on your learning this week and how it connected to your hands-on work in the hangar...
            </p>
            <Textarea
              id="reflection"
              value={reflectionText}
              onChange={(e) => {
                setReflectionText(e.target.value);
                setError(null);
              }}
              placeholder="Share your thoughts and experiences from this week..."
              className="min-h-32 resize-none"
              maxLength={1000}
            />
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span className={cn(remainingChars < 100 && "text-orange-600", remainingChars < 0 && "text-red-600")}>
                {characterCount}/1000 characters
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload Section */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Upload Photos/Documents (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              "hover:border-primary/50 hover:bg-primary/5",
              "border-muted-foreground/25"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-base font-medium mb-2">Click to upload files</p>
            <p className="text-sm text-muted-foreground">
              Max 5 files, 10MB each
            </p>
          </div>

          {/* Existing Files List */}
          {existingFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Current files:</p>
              {existingFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  {file.type?.startsWith("image/") ? (
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <FileIcon className="h-12 w-12 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeExistingFile(file.id)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* New Files List */}
          {newFiles.length > 0 && (
            <div className="space-y-2">
              {existingFiles.length > 0 && (
                <p className="text-sm font-medium text-muted-foreground">New files:</p>
              )}
              {newFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  {file.preview ? (
                    <img
                      src={file.preview}
                      alt={file.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <FileIcon className="h-12 w-12 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeNewFile(index)}
                    className="h-8 w-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {(existingFiles.length + newFiles.length) >= 5 && (
            <p className="text-xs text-muted-foreground text-center">
              Maximum 5 files reached. Remove a file to upload more.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      <div className="space-y-2">
        <Button
          type="submit"
          disabled={isSubmitting || !reflectionText.trim()}
          className="w-full bg-[#8B4513] hover:bg-[#6B3410] text-white"
          size="lg"
        >
          <Send className="mr-2 h-4 w-4" />
          {isSubmitting 
            ? "Submitting..." 
            : initialData 
              ? `Update Week ${weekNumber} Submission`
              : `Submit Week ${weekNumber}`
          }
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Your submission will be sent to your mentor for review
        </p>
      </div>
    </form>
  );
}
