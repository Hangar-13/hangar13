"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";
import { createExternalCertification } from "@/app/actions/external-certifications";
import { createClient } from "@/lib/supabase-browser";
import {
  EXTERNAL_CERTIFICATION_TYPE_LABELS,
  EXTERNAL_CERTIFICATION_TYPES,
} from "@/lib/external-certification";
import { Upload, X, File as FileIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const externalCertificationSchema = z
  .object({
    certificationType: z.enum(EXTERNAL_CERTIFICATION_TYPES),
    certificationTypeOther: z.string().optional(),
    name: z.string().trim().min(1, "Certificate name is required"),
    awardedOn: z.string().min(1, "Award date is required"),
    expiresOn: z.string().optional(),
    issuingOrganization: z
      .string()
      .trim()
      .min(1, "Issuing organization is required"),
    notes: z.string().max(2000, "Notes cannot exceed 2000 characters").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.certificationType === "other" && !data.certificationTypeOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please describe the certification type",
        path: ["certificationTypeOther"],
      });
    }
    if (data.expiresOn && data.expiresOn < data.awardedOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expiration must be on or after the award date",
        path: ["expiresOn"],
      });
    }
  });

type ExternalCertificationFormData = z.infer<typeof externalCertificationSchema>;

export function ExternalCertificationForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExternalCertificationFormData>({
    resolver: zodResolver(externalCertificationSchema),
    defaultValues: {
      certificationType: "factory_school",
      certificationTypeOther: "",
      name: "",
      awardedOn: "",
      expiresOn: "",
      issuingOrganization: "",
      notes: "",
    },
  });

  const certificationType = watch("certificationType");

  const clearSelectedFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      setSubmitError("File must be 10MB or smaller.");
      return;
    }

    clearSelectedFile();
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    }
    setSubmitError(null);
  };

  const onSubmit = async (data: ExternalCertificationFormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      let document:
        | {
            url: string;
            fileName: string;
            fileSize: number;
            fileType: string;
          }
        | undefined;

      if (selectedFile) {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setSubmitError("You must be logged in to save a certification.");
          return;
        }

        const fileExt = selectedFile.name.split(".").pop() ?? "bin";
        const storagePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("external-certifications")
          .upload(storagePath, selectedFile, {
            contentType: selectedFile.type,
            upsert: false,
          });

        if (uploadError) {
          setSubmitError(`Failed to upload file: ${uploadError.message}`);
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage
          .from("external-certifications")
          .getPublicUrl(storagePath);

        document = {
          url: publicUrl,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type,
        };
      }

      const result = await createExternalCertification({
        certificationType: data.certificationType,
        certificationTypeOther: data.certificationTypeOther,
        name: data.name,
        awardedOn: data.awardedOn,
        expiresOn: data.expiresOn || undefined,
        issuingOrganization: data.issuingOrganization,
        notes: data.notes,
        document,
      });

      if (result.error) {
        setSubmitError(result.error);
        return;
      }

      reset({
        certificationType: "factory_school",
        certificationTypeOther: "",
        name: "",
        awardedOn: "",
        expiresOn: "",
        issuingOrganization: "",
        notes: "",
      });
      clearSelectedFile();
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
      <section className="space-y-4">
        <DashboardSectionLabel>Certification details</DashboardSectionLabel>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="certificationType">Type of certificate</Label>
            <Select
              value={certificationType}
              onValueChange={(value) =>
                setValue(
                  "certificationType",
                  value as ExternalCertificationFormData["certificationType"],
                  { shouldValidate: true }
                )
              }
            >
              <SelectTrigger id="certificationType">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {EXTERNAL_CERTIFICATION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {EXTERNAL_CERTIFICATION_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {certificationType === "other" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="certificationTypeOther">Describe the type</Label>
              <Input
                id="certificationTypeOther"
                placeholder="e.g. Composite repair, NDT Level II"
                {...register("certificationTypeOther")}
              />
              {errors.certificationTypeOther ? (
                <p className="text-sm text-destructive">
                  {errors.certificationTypeOther.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Certificate name</Label>
            <Input
              id="name"
              placeholder="e.g. Boeing Structural Repair Level 1"
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="awardedOn">Date awarded</Label>
            <Input id="awardedOn" type="date" {...register("awardedOn")} />
            {errors.awardedOn ? (
              <p className="text-sm text-destructive">
                {errors.awardedOn.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiresOn">Expiration date (optional)</Label>
            <Input id="expiresOn" type="date" {...register("expiresOn")} />
            {errors.expiresOn ? (
              <p className="text-sm text-destructive">
                {errors.expiresOn.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="issuingOrganization">Issuing organization</Label>
            <Input
              id="issuingOrganization"
              placeholder="School, employer, or certifying body"
              {...register("issuingOrganization")}
            />
            {errors.issuingOrganization ? (
              <p className="text-sm text-destructive">
                {errors.issuingOrganization.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Certificate number, location, or other details"
              className="min-h-24 resize-none"
              {...register("notes")}
            />
            {errors.notes ? (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <DashboardSectionLabel>Certificate photo or PDF</DashboardSectionLabel>
        <p className="text-sm text-muted-foreground">
          Upload a photo or scan of the certificate. JPEG, PNG, WebP, GIF, or PDF
          up to 10MB.
        </p>

        <div
          className={cn(
            "cursor-pointer rounded-md p-8 text-center ring-1 ring-black/[0.06] transition-colors",
            "hover:bg-primary/5 hover:ring-primary/20"
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 text-base font-medium">Click to upload a file</p>
          <p className="text-sm text-muted-foreground">Optional but recommended</p>
        </div>

        {selectedFile ? (
          <div className="flex items-center gap-3 rounded-md bg-muted/25 p-3 ring-1 ring-black/[0.04]">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={selectedFile.name}
                className="h-12 w-12 rounded object-cover"
              />
            ) : (
              <FileIcon className="h-12 w-12 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearSelectedFile}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </section>

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}

      {submitSuccess ? (
        <div className="flex items-start gap-2 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Certification saved. You can add another below.</p>
        </div>
      ) : null}

      <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
        {isSubmitting ? "Saving..." : "Save certification"}
      </Button>
    </form>
  );
}
