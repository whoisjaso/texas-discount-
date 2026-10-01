import { notFound } from "next/navigation";
import FunnelLocaleProvider from "@/components/admin/funnel/FunnelLocaleProvider";
import PacketScreen from "@/components/admin/packet/PacketScreen";
import { getSaleDetail, vehicleLabel } from "@/lib/admin/sale-desk";
import { getSalePacket, type PacketDocument } from "@/lib/admin/sale-packet";
import { readBuyerId } from "@/lib/sales/buyer-id";
import { createClient } from "@/lib/supabase/server";
import { dealership } from "@/lib/dealership-config";
import { getFunnelBundles } from "@/lib/sales/i18n";
import { resolveAdminLanguageWithUser } from "@/lib/admin/server-language";
import QRCode from "qrcode";
import { issueSigningToken, signingUrl } from "@/lib/sales/signing-token";
import { ceremonyCanSign, ceremonyDocuments } from "@/lib/sales/signing-ceremony";
import { readSalePlan } from "@/lib/sales/sale-plan";
import { readSalvagePlan } from "@/lib/sales/salvage-plan";
import { dealTitleBadge } from "@/lib/sales/deal-badge";
import { SITE_URL } from "@/lib/dealership-config";

export const dynamic = "force-dynamic";
export const metadata = { title: `Paperwork - ${dealership.shortName} Auto` };

interface Props {
  params: Promise<{ dealId: string }>;
}

/**
 * The end of the sale: everything it produced, on one screen, from anywhere.
 *
 * This is the last step of the guide and it is deliberately the last step. A
 * sale can be run start to finish on a phone standing next to the car, and a
 * phone cannot reach a printer without a cable nobody has. So the work does
 * not end at a signature: it ends here, at a page a computer can open half an
 * hour later to print the same documents.
 *
 * Nothing here is regenerated. Each row is a `document_agreements` record and
 * each link runs it through the PDF endpoint that already existed, so what
 * prints is what was signed rather than what the live rows say today.
 *
 * The licence is on this page too, and it is not a document. It is two
 * photographs in a private bucket, so they are signed for ten minutes at a
 * time, which is why this page is never cached.
 */
export default async function SalePacketPage({ params }: Props) {
  const { dealId } = await params;

  const sale = await getSaleDetail(dealId);
  if (!sale) notFound();

  let documents: PacketDocument[] = [];
  let loadFailed = false;
  try {
    documents = await getSalePacket(dealId);
  } catch {
    // The licence and the way back are still worth showing. A failed read of
    // one table is not a reason to give somebody an error page.
    loadFailed = true;
  }

  const licence = readBuyerId(sale.stepData);
  const photographs = await (async () => {
    if (!licence.image && !licence.backImage && !licence.document) return [];
    const supabase = await createClient();
    const sign = async (path: string | null, kind: "front" | "back" | "document") => {
      if (!path) return null;
      // Ten minutes: long enough to print, short enough that a URL copied out
      // of this page stops working quickly.
      const { data } = await supabase.storage.from("buyer-ids").createSignedUrl(path, 600);
      return data?.signedUrl ? { kind, url: data.signedUrl } : null;
    };
    const signed = await Promise.all([
      sign(licence.image, "front"),
      sign(licence.backImage, "back"),
      sign(licence.document, "document"),
    ]);
    return signed.filter(
      (entry): entry is { kind: "front" | "back" | "document"; url: string } =>
        entry !== null,
    );
  })();

  /**
   * The FTC window sticker, printable from here on every deal.
   *
   * It is the one document in the packet that never writes a record, so it
   * could never appear in the lists above, and the only other place to print
   * it was the templates section a corridor away. The car has to wear it
   * before it is shown, which makes this page, the one somebody opens to
   * print, the right place for a permanent row.
   *
   * Both languages, always: the FTC Used Car Rule requires the Spanish form
   * when the sale is conducted in Spanish, and on a deal recorded as Spanish
   * that link comes first.
   */
  const buyersGuideHref = (lang: "en" | "es"): string => {
    const params = new URLSearchParams();
    if (sale.vehicle?.id) params.set("vehicleId", sale.vehicle.id);
    if (lang === "es") params.set("lang", "es");
    const qs = params.toString();
    return qs ? `/api/documents/buyers-guide?${qs}` : "/api/documents/buyers-guide";
  };
  const buyersGuideLanguages: readonly ("en" | "es")[] =
    sale.language === "es" ? ["es", "en"] : ["en", "es"];

  /**
   * The signing session, minted here because only the server can sign it.
   *
   * Offered whenever a filed document lacks the buyer's stroke. Like the
   * licence capture link, a missing signing secret costs the ceremony and
   * nothing else: the packet still lists and prints.
   */
  const signing = await (async () => {
    // The same rule the ceremony walks: filed, printable, not ink-only, not
    // the 130-U we sign under a power of attorney, and still unsigned.
    const unsigned = ceremonyDocuments(
      documents.map((document) => ({
        id: document.id,
        documentType: document.documentType,
        finalized: document.finalized,
        hasCompletedLink: document.hasCompletedLink,
        signed: document.signed,
      })),
      { dealerSignsTitle: readSalePlan(sale.stepData).titleSignedBy === "dealer" },
    ).some((document) => !document.signed);
    if (!unsigned) return null;
    try {
      const token = issueSigningToken(sale.id);
      const url = signingUrl(SITE_URL, token);
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M" });
      return { url, qr, canSign: ceremonyCanSign(sale.language) };
    } catch {
      return null;
    }
  })();

  const { lang, userId } = await resolveAdminLanguageWithUser();

  return (
    <FunnelLocaleProvider bundles={getFunnelBundles()} initial={lang} userId={userId}>
      <PacketScreen
        signing={signing}
        dealerSignsTitle={readSalePlan(sale.stepData).titleSignedBy === "dealer"}
        badge={(() => {
          const badge = dealTitleBadge(sale.vehicle?.titleStatus, readSalvagePlan(sale.stepData).path);
          return { key: badge.key, tone: badge.tone };
        })()}
        dealId={dealId}
        vehicle={vehicleLabel(sale.vehicle)}
        buyerName={sale.buyer?.name?.trim() ?? ""}
        documents={documents}
        loadFailed={loadFailed}
        photographs={photographs}
        buyersGuideLanguages={buyersGuideLanguages}
        buyersGuideHrefs={{ en: buyersGuideHref("en"), es: buyersGuideHref("es") }}
        textingEnabled={dealership.paperworkTextsEnabled}
        buyerHasPhone={Boolean(sale.buyer?.phone?.trim())}
      />
    </FunnelLocaleProvider>
  );
}
