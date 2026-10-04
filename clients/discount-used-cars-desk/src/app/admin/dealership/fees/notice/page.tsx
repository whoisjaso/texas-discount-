import { redirect } from "next/navigation";
import NoticePrintButton from "./NoticePrintButton";
import { getCurrentAdminAccess } from "@/lib/admin/current-admin";
import { hasTeamPermission } from "@/lib/operations/team";
import { dealership, factOr } from "@/lib/dealership-config";
import { DEALERSHIP_HOME } from "@/lib/admin/workspace";
import { DOC_FEE_NOTICE_CITATION, DOC_FEE_NOTICE_EN, DOC_FEE_NOTICE_ES } from "@/lib/legal/doc-fee-notice";

export const metadata = { title: `Documentary Fee Notice - ${dealership.name}` };
export const dynamic = "force-dynamic";

/**
 * The posted notice (Tex. Fin. Code §348.006(d)): the documentary fee notice,
 * word for word, in English and in the OCCC-approved Spanish (Bulletin B09-3),
 * to print and post where sales are closed. Anyone who reads sales may print
 * it; it states no figure, only the law's words.
 */
export default async function DocFeeNoticePage() {
  const access = await getCurrentAdminAccess();
  if (!access.user) redirect("/admin/login");
  if (!hasTeamPermission(access.role, "sales:read")) redirect(DEALERSHIP_HOME);

  return (
    <div className="ed-admin px-5 py-8 md:px-10 md:py-12" data-posted-notice="">
      <div className="ed-posted-notice-actions">
        <NoticePrintButton />
      </div>
      <article className="ed-posted-notice">
        <p className="ed-posted-notice-dealer">{factOr(dealership.legalName, "dealer legal name")}</p>
        <h1 className="ed-posted-notice-title">Documentary Fee Notice</h1>
        <p className="ed-posted-notice-text" lang="en">{DOC_FEE_NOTICE_EN}</p>
        <h2 className="ed-posted-notice-title" lang="es">Aviso sobre el cargo documental</h2>
        <p className="ed-posted-notice-text" lang="es">{DOC_FEE_NOTICE_ES}</p>
        <p className="ed-posted-notice-cite">{DOC_FEE_NOTICE_CITATION}</p>
      </article>
    </div>
  );
}
