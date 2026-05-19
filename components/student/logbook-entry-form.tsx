"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { createLogbookEntry } from "@/app/actions/logbook";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, FileText, Briefcase, Check } from "lucide-react";

const logbookEntrySchema = z.object({
  entryDate: z.string().min(1, "Date is required"),
  hoursWorked: z
    .number()
    .positive("Hours must be greater than 0")
    .max(24, "Hours cannot exceed 24"),
  entryType: z.string().min(1, "Entry type is required"),
  notes: z
    .string()
    .max(2000, "Notes cannot exceed 2000 characters")
    .refine((s) => s.trim().length >= 1, {
      message: "Notes must contain at least one character.",
    }),
});

type LogbookEntryFormData = z.infer<typeof logbookEntrySchema>;

const entryTypes = [
  { value: "learning", label: "Learning & Study" },
  { value: "practice", label: "Practice & Exercises" },
  { value: "project", label: "Project Work" },
  { value: "meeting", label: "Meeting with Mentor" },
  { value: "review", label: "Code Review" },
  { value: "research", label: "Research & Documentation" },
  { value: "other", label: "Other" },
];

export function LogbookEntryForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<LogbookEntryFormData>({
    resolver: zodResolver(logbookEntrySchema),
    defaultValues: {
      entryDate: new Date().toISOString().split("T")[0], // Today's date
      hoursWorked: 0,
      entryType: "",
      notes: "",
    },
  });

  const entryTypeValue = watch("entryType");

  const onSubmit = async (data: LogbookEntryFormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);
    setIsSubmitting(true);

    try {
      // Calculate start/end time from hours (simplified - using 9am as start)
      const startTime = "09:00";
      const hours = data.hoursWorked;
      const endHour = 9 + Math.floor(hours);
      const endMinute = Math.round((hours % 1) * 60);
      const endTime = `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`;

      const result = await createLogbookEntry({
        entryDate: data.entryDate,
        startTime,
        endTime,
        hoursWorked: data.hoursWorked,
        taskDescription: `${data.entryType}: ${data.notes}`,
        ataChapter: "General",
        certified: false,
      });

      if (result.error) {
        setSubmitError(result.error);
        setIsSubmitting(false);
        return;
      }

      setSubmitSuccess(true);
      reset();
      // Reset success message after 3 seconds
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 3000);
      setIsSubmitting(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>New Logbook Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {submitError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          {submitSuccess && (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
              <Check className="h-4 w-4" />
              Logbook entry created successfully!
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entryDate" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date
              </Label>
              <Input
                id="entryDate"
                type="date"
                {...register("entryDate")}
                aria-invalid={errors.entryDate ? "true" : "false"}
              />
              {errors.entryDate && (
                <p className="text-sm text-destructive">
                  {errors.entryDate.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hoursWorked" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Hours Worked
              </Label>
              <Input
                id="hoursWorked"
                type="number"
                step="0.25"
                min="0"
                max="24"
                placeholder="0.00"
                {...register("hoursWorked", {
                  valueAsNumber: true,
                })}
                aria-invalid={errors.hoursWorked ? "true" : "false"}
              />
              {errors.hoursWorked && (
                <p className="text-sm text-destructive">
                  {errors.hoursWorked.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entryType" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Entry Type
            </Label>
            <Select
              value={entryTypeValue}
              onValueChange={(value) => setValue("entryType", value)}
            >
              <SelectTrigger
                id="entryType"
                className="w-full"
                aria-invalid={errors.entryType ? "true" : "false"}
              >
                <SelectValue placeholder="Select entry type" />
              </SelectTrigger>
              <SelectContent>
                {entryTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.entryType && (
              <p className="text-sm text-destructive">
                {errors.entryType.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Describe what you worked on, what you learned, challenges you faced, etc..."
              rows={5}
              {...register("notes")}
              aria-invalid={errors.notes ? "true" : "false"}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating Entry..." : "Create Logbook Entry"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

