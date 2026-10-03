import { redirect } from "next/navigation";

/**
 * The buyer used to be its own screen, reached by carrying the car forward in
 * the query string. Both answers are asked for together now, so this route
 * only exists to catch a link written before that.
 */
export default function RetiredBuyerStepPage() {
  redirect("/admin/sales/new");
}
