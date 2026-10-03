import type { Metadata } from "next";
import RecoverClient from "./RecoverClient";
import { brand } from "@/lib/dealership-config";

export const metadata: Metadata = {
  title: `Reset Password | ${brand.short}`,
  robots: "noindex, nofollow",
};

/**
 * The one public recovery surface, hard-coded as the only place a reset
 * link lands. Two states in one page: no token in the fragment shows the
 * request form; a token shows the choose-a-new-password form, which posts
 * deliberately — a link scanner that prefetches the URL consumes nothing,
 * because the bearer rides the fragment and nothing happens without the
 * human's POST.
 */
export default function RecoverPage() {
  return <RecoverClient />;
}
