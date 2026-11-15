"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Student {
  id: string;
  full_name: string | null;
}

interface StudentProgressHeaderProps {
  students: Student[];
  currentStudentId: string;
  /** Page to push when changing student (preserves ?student=) */
  basePath?: string;
  heading?: string;
  /** Query keys to drop when the student changes, such as a course id. */
  clearParams?: string[];
}

export function StudentProgressHeader({
  students,
  currentStudentId,
  basePath = "/dashboard/mentor/mentees/progress",
  heading = "Progress for",
  clearParams = [],
}: StudentProgressHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleStudentChange = (newId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const key of clearParams) params.delete(key);
    params.set("student", newId);
    router.push(`${basePath}?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-bold tracking-tight">{heading}</span>
      <Select
        value={currentStudentId}
        onValueChange={handleStudentChange}
      >
        <SelectTrigger className="w-[220px] h-9 text-base font-bold border-0 shadow-none focus:ring-0 bg-transparent hover:bg-secondary/50">
          <SelectValue placeholder="Select student" />
        </SelectTrigger>
        <SelectContent>
          {students.map((student) => (
            <SelectItem key={student.id} value={student.id}>
              {student.full_name || "Unnamed Student"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
