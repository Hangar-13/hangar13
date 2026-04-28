import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

interface CurrentTrainingCardProps {
  currentWeek: number;
  totalWeeks: number;
  topic: string;
  dueDate?: Date;
}

export function CurrentTrainingCard({
  currentWeek,
  totalWeeks,
  topic,
  dueDate,
}: CurrentTrainingCardProps) {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Card className="bg-primary/50 text-primary-foreground border-primary">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div>
            <p className="text-primary-foreground/80 text-sm mb-1">
              Week {currentWeek} of {totalWeeks}
            </p>
            <h3 className="text-2xl font-bold mb-2">{topic}</h3>
            {dueDate && (
              <p className="text-primary-foreground/80 text-sm">
                Due: {formatDate(dueDate)}
              </p>
            )}
          </div>
          <Button
            asChild
            variant="secondary"
            className="w-full bg-white text-[#1E1E38] hover:bg-white/90"
          >
            <Link href="/dashboard/student/training">
              View This Week&apos;s Training
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
