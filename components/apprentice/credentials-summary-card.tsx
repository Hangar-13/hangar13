import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award } from "lucide-react";

type Props = {
  trainingCount: number;
  certificationCount: number;
};

export function CredentialsSummaryCard({ trainingCount, certificationCount }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" aria-hidden />
          My Trainings
        </CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/apprentice/credentials">Manage</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{trainingCount}</span> completed training
          {trainingCount === 1 ? "" : "s"},{" "}
          <span className="font-medium text-foreground">{certificationCount}</span> certification
          {certificationCount === 1 ? "" : "s"} on record.
        </p>
      </CardContent>
    </Card>
  );
}
