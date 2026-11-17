"use client";

import { SearchableEquipmentCombobox } from "@/components/student/searchable-equipment-combobox";
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
import type { PriorOjtExperienceLineInput } from "@/app/actions/prior-ojt";

const MONTHS = [
  ["01", "Jan"],
  ["02", "Feb"],
  ["03", "Mar"],
  ["04", "Apr"],
  ["05", "May"],
  ["06", "Jun"],
  ["07", "Jul"],
  ["08", "Aug"],
  ["09", "Sep"],
  ["10", "Oct"],
  ["11", "Nov"],
  ["12", "Dec"],
] as const;

const YEARS = Array.from({ length: new Date().getFullYear() - 1940 + 1 }, (_, index) =>
  String(new Date().getFullYear() - index),
);

function splitMonthValue(value: string): { year: string; month: string } {
  const match = /^(\d{4})?-(\d{2})?$/.exec(value);
  if (!match) return { year: "", month: "" };
  return { year: match[1] ?? "", month: match[2] ?? "" };
}

function joinMonthValue(year: string, month: string): string {
  if (year && month) return `${year}-${month}`;
  if (year) return `${year}-`;
  if (month) return `-${month}`;
  return "";
}

function MonthYearField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { year, month } = splitMonthValue(value);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Select
          value={month || undefined}
          onValueChange={(next) => onChange(joinMonthValue(year, next))}
        >
          <SelectTrigger id={id} className="w-[8.25rem]" aria-label={`${label} month`}>
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map(([value, name]) => (
              <SelectItem key={value} value={value}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={year || undefined}
          onValueChange={(next) => onChange(joinMonthValue(next, month))}
        >
          <SelectTrigger className="w-[5.75rem]" aria-label={`${label} year`}>
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export type ExperienceLineDraft = PriorOjtExperienceLineInput & { key: string };

function newLine(): ExperienceLineDraft {
  return {
    key: crypto.randomUUID(),
    start: "",
    end: "",
    airframes: [],
    engines: [],
  };
}

function EquipmentList({
  label,
  kind,
  values,
  onChange,
}: {
  label: string;
  kind: "aircraft" | "engine";
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {values.map((value, index) => (
        <div key={`${kind}-${index}`} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchableEquipmentCombobox
              equipmentKind={kind}
              value={value}
              onValuePickAction={(next) =>
                onChange(values.map((item, itemIndex) => (itemIndex === index ? next : item)))
              }
              placeholder={kind === "aircraft" ? "Search or enter airframe…" : "Search or enter engine…"}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}>
        Add {label}
      </Button>
    </div>
  );
}

export function PriorOjtExperienceFields({
  years,
  months,
  lines,
  onYears,
  onMonths,
  onLines,
}: {
  years: string;
  months: string;
  lines: ExperienceLineDraft[];
  onYears: (value: string) => void;
  onMonths: (value: string) => void;
  onLines: (lines: ExperienceLineDraft[]) => void;
}) {
  function updateLine(key: string, patch: Partial<ExperienceLineDraft>) {
    onLines(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Label className="text-sm font-medium">Total experience as an aviation mechanic:</Label>
        <Input
          id="prior-ojt-years"
          type="number"
          min={0}
          max={80}
          inputMode="numeric"
          value={years}
          onChange={(event) => onYears(event.target.value)}
          className="w-20 border-2 border-foreground/45 bg-background dark:border-foreground/70"
          aria-label="Years"
        />
        <span className="text-sm text-muted-foreground">years</span>
        <Input
          id="prior-ojt-months"
          type="number"
          min={0}
          max={11}
          inputMode="numeric"
          value={months}
          onChange={(event) => onMonths(event.target.value)}
          className="w-20 border-2 border-foreground/45 bg-background dark:border-foreground/70"
          aria-label="Months"
        />
        <span className="text-sm text-muted-foreground">months</span>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Experience by airframe and engine</h3>
        <div className="overflow-x-auto rounded-md ring-1 ring-black/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-px whitespace-nowrap px-3 py-2">Dates</th>
                <th className="px-3 py-2">Airframe</th>
                <th className="px-3 py-2">Engine</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-muted-foreground">
                    No lines yet.
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => (
                  <tr key={line.key} className="border-b align-top last:border-b-0">
                    <td className="w-px whitespace-nowrap px-3 py-3">
                      <div className="flex items-end gap-3">
                        <MonthYearField
                          id={`prior-ojt-start-${line.key}`}
                          label="From"
                          value={line.start}
                          onChange={(start) => updateLine(line.key, { start })}
                        />
                        <MonthYearField
                          id={`prior-ojt-end-${line.key}`}
                          label="To"
                          value={line.end}
                          onChange={(end) => updateLine(line.key, { end })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 px-0"
                        onClick={() => onLines(lines.filter((item) => item.key !== line.key))}
                      >
                        Remove line {index + 1}
                      </Button>
                    </td>
                    <td className="px-3 py-3">
                      <EquipmentList
                        label="airframe"
                        kind="aircraft"
                        values={line.airframes}
                        onChange={(airframes) => updateLine(line.key, { airframes })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <EquipmentList
                        label="engine"
                        kind="engine"
                        values={line.engines}
                        onChange={(engines) => updateLine(line.key, { engines })}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="outline" onClick={() => onLines([...lines, newLine()])}>
          Add a line
        </Button>
      </div>
    </div>
  );
}

export function experienceDraftFromLines(lines: PriorOjtExperienceLineInput[]): ExperienceLineDraft[] {
  return lines.map((line) => ({ ...line, key: crypto.randomUUID() }));
}

export function parseExperienceNumbers(years: string, months: string): {
  years: number;
  months: number;
} | { error: string } {
  if (years.trim() === "" || months.trim() === "") {
    return { error: "Enter total years and months as an aviation mechanic." };
  }
  const yearValue = Number(years);
  const monthValue = Number(months);
  if (!Number.isInteger(yearValue) || yearValue < 0 || yearValue > 80) {
    return { error: "Enter total years as a whole number from 0 to 80." };
  }
  if (!Number.isInteger(monthValue) || monthValue < 0 || monthValue > 11) {
    return { error: "Enter leftover months as a whole number from 0 to 11." };
  }
  return { years: yearValue, months: monthValue };
}
