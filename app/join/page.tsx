import type { Metadata } from "next";
import { MailingListKiosk } from "@/components/marketing/mailing-list-kiosk";

export const metadata: Metadata = {
  title: "Join the mailing list · Hangar13",
  description:
    "Join the Hangar13 mailing list. We won’t spam you, and you can opt out at any time.",
  robots: { index: false, follow: false },
};

export default function JoinMailingListPage() {
  return <MailingListKiosk />;
}
