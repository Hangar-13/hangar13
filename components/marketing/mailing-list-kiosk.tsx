"use client";

import { Hangar13Mark } from "@/components/brand/hangar13-mark";
import { MailingListForm } from "@/components/marketing/mailing-list-form";

export function MailingListKiosk() {
  return (
    <div className="marketing-page flex min-h-svh flex-col bg-[#F4F7F9] text-[#121417]">
      <header className="px-5 py-5 sm:px-8">
        <Hangar13Mark size="lg" />
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-10 sm:items-center sm:px-8">
        <div className="w-full max-w-md border border-[#121417] bg-white p-6 sm:p-10">
          <MailingListForm
            defaultAudience="mechanic"
            resetAfterJoin
            large
            titleTag="h1"
          />
        </div>
      </main>
    </div>
  );
}
