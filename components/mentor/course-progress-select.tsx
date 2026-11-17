"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CourseProgressSelect({
  courses,
  currentCourseId,
}: {
  courses: Array<{ id: string; name: string }>;
  currentCourseId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(courseId: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("course", courseId);
    router.push(`/dashboard/mentor/mentees/progress?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">Course</span>
      <Select value={currentCourseId} onValueChange={handleChange}>
        <SelectTrigger className="h-9 w-[min(100%,20rem)] text-base font-semibold">
          <SelectValue placeholder="Select a course" />
        </SelectTrigger>
        <SelectContent>
          {courses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              {course.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
