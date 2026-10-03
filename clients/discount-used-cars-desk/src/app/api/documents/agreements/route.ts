import { NextRequest, NextResponse } from 'next/server';
import { FILING_GATE_MESSAGES } from '@/lib/sales/refile-gates';
import { isFiledAgreement, type FiledAgreementRow } from '@/lib/sales/down-payment-freeze';
import { requireAdmin } from '@/lib/admin-auth';
import {
  computeSigningTokenExpiresAt,
  generateSigningToken,
} from '@/lib/rentals/signing-tokens';
import { createServiceClient } from '@/lib/supabase/service';
import {
  isDealershipContractType,
  RENTAL_DOCUMENT_TYPES,
} from '@/lib/documents/contract-classification';
import { decodeCompletedLinkFromUrl, withCompletedLinkDealerData } from '@/lib/documents/customerPortal';
import {
  FEE_DOCUMENTS,
  LINK_UNREADABLE,
  feeDocumentRefusal as gateFeeDocument,
  noticeStamp,
} from '@/lib/documents/fee-document-gate';

/** The fee gate's refusal as a response, or null. */
async function feeDocumentRefusal(
  dealId: string | null,
  payloads: Array<Record<string, unknown>>,
): Promise<NextResponse | null> {
  const refused = await gateFeeDocument(dealId, payloads);
  return refused ? NextResponse.json({ error: refused.error, code: refused.code }, { status: refused.status }) : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// ============================================================
// GET — Admin only, excludes completed_link blob for performance
// ============================================================

// Core columns (always present). New customer data columns (migration-13)
// are fetched on-demand via the individual agreement endpoint using select('*').
// NOTE: finalized_at, last_emailed_at, pdf_buyer_path, pdf_dealer_path
// are fetched on-demand via the individual agreement endpoint (select('*')).
// They require migration-14 — do NOT add them here until migration is confirmed.
const LISTING_COLUMNS = [
  'id', 'document_type', 'customer_id', 'buyer_name', 'buyer_email', 'buyer_phone',
  'vehicle_description', 'vehicle_vin', 'status', 'sent_at', 'completed_at',
  'acknowledgments', 'has_buyer_signature', 'has_cobuyer_signature',
  'has_dealer_signature', 'has_buyer_id', 'deleted_at', 'language',
].join(', ');

function redactAgreementListingRow(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row };
  delete rest.completed_link;
  delete rest.buyer_id_photo;
  delete rest.signing_token;
  delete rest.signing_token_expires_at;
  return rest;
}

export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req, 'documents:read');
  if (authError) return authError;

  const supabase = createServiceClient();
  // Rentals are managed exclusively from /admin/rentals. Filter both in the
  // query and after fetch so legacy rental document_type variants do not leak
  // into the dealership agreement tracker.
  const { data, error } = await supabase
    .from('document_agreements')
    .select(LISTING_COLUMNS)
    .not('document_type', 'in', `(${RENTAL_DOCUMENT_TYPES.join(',')})`)
    .order('sent_at', { ascending: false });

  if (error) {
    console.error('[agreements GET] Supabase error:', error.message, error.code, error.details);
    // Fallback: try minimal query if column-related error
    if (error.message?.includes('column') || error.code === '42703') {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('document_agreements')
        .select('*')
        .not('document_type', 'in', `(${RENTAL_DOCUMENT_TYPES.join(',')})`)
        .order('sent_at', { ascending: false });
      if (!fallbackError && fallbackData) {
        // Strip large blobs from response
        const clean = fallbackData
          .filter((row: Record<string, unknown>) =>
            isDealershipContractType({
              documentType: row.document_type as string | null,
              title: row.title as string | null,
              templateName: row.template_name as string | null,
              sourcePath: row.source_path as string | null,
              contentHints: [
                row.vehicle_description as string | null,
                row.completed_link as string | null,
              ],
            }),
          )
          .map((row: Record<string, unknown>) => {
            return redactAgreementListingRow(row);
          });
        return NextResponse.json(clean);
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return NextResponse.json(
    rows.filter((row) =>
      isDealershipContractType({
        documentType: row.document_type as string | null,
        title: row.title as string | null,
        templateName: row.template_name as string | null,
        sourcePath: row.source_path as string | null,
        contentHints: [row.vehicle_description as string | null],
      }),
    ).map(redactAgreementListingRow),
  );
}

// ============================================================
// POST - Admin creates a pending agreement for a customer link.
// ============================================================

export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req, 'documents:manage');
  if (authError) return authError;

  const supabase = createServiceClient();
  const body = await req.json();

  if (!body.document_type) {
    return NextResponse.json({ error: 'Missing document_type' }, { status: 400 });
  }

  const status = body.status || 'pending';
  const isPending = status === 'pending';

  /*
    One current bill of sale per sale, here as in the sale's own filing
    (owner's decision 10/02/2026; refile-gates.ts, billOfSaleAlreadyFiled):
    this older route cannot file a second bill of sale on a deal that holds
    a current one. A second copy is filed only after the first is voided.
  */
  if (
    body.deal_id &&
    !isPending &&
    (body.document_type === 'billOfSale' || body.document_type === 'salvageBillOfSale')
  ) {
    const { data: rows, error: rowsError } = await supabase
      .from('document_agreements')
      .select('id, document_type, status, finalized_at, completed_at, voided_at')
      .eq('deal_id', body.deal_id);
    if (rowsError) {
      return NextResponse.json({ error: 'Filed documents could not be checked.' }, { status: 500 });
    }
    const current = ((rows ?? []) as FiledAgreementRow[]).some(
      (row) => (row.document_type === 'billOfSale' || row.document_type === 'salvageBillOfSale') && isFiledAgreement(row),
    );
    if (current) {
      return NextResponse.json({ error: FILING_GATE_MESSAGES.billOfSaleAlreadyFiled }, { status: 409 });
    }
  }
  /*
    The dealer charges, here as in the sale's own filing (fee-schedule.ts;
    rulebook texas-dealer-fees.md section 5.4): this older route takes a
    finished document as an encoded link, or a pending one as portal data
    the customer later completes from, so both are read and their fees
    checked; a link that cannot be read is refused rather than filed
    unchecked. What files carries the documentary fee notice's stamp, so the
    notice prints beside the fee as it does on the sale's own paper.
  */
  let completedLink: unknown = body.completed_link;
  let portalData: unknown = body.portal_data;
  if (FEE_DOCUMENTS.has(body.document_type)) {
    const payloads: Array<Record<string, unknown>> = [];
    if (typeof completedLink === 'string' && completedLink !== '') {
      const decoded = decodeCompletedLinkFromUrl(completedLink);
      if (!decoded) return NextResponse.json({ error: LINK_UNREADABLE, code: 'linkUnreadable' }, { status: 422 });
      payloads.push({ ...(decoded.dd ?? {}), ...(decoded.cd ?? {}) } as Record<string, unknown>);
    }
    const portal = asObject(portalData);
    const portalDealer = asObject(portal?.d);
    if (portalDealer) payloads.push({ ...portalDealer, ...(asObject(portal?.cd) ?? {}) });
    const refused = await feeDocumentRefusal(typeof body.deal_id === 'string' && body.deal_id ? body.deal_id : null, payloads);
    if (refused) return refused;
    if (typeof completedLink === 'string' && completedLink !== '') {
      completedLink = withCompletedLinkDealerData(completedLink, noticeStamp(body.language)) ?? completedLink;
    }
    if (portal && portalDealer) {
      portalData = { ...portal, d: { ...portalDealer, ...noticeStamp(body.language) } };
    }
  }

  const signingToken = body.signing_token || generateSigningToken();
  const signingTokenExpiresAt =
    body.signing_token_expires_at || computeSigningTokenExpiresAt();

  const { data, error } = await supabase
    .from('document_agreements')
    .insert({
      document_type: body.document_type,
      buyer_name: body.buyer_name || null,
      buyer_email: body.buyer_email || null,
      buyer_phone: body.buyer_phone || null,
      customer_id: body.customer_id || null,
      // Links every Bill of Sale / 130-U / financing contract created from a
      // paperwork deal back to that deal, so one sale = one linked document set.
      deal_id: body.deal_id || null,
      vehicle_description: body.vehicle_description || null,
      vehicle_vin: body.vehicle_vin || null,
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      expires_at: isPending ? body.expires_at || signingTokenExpiresAt : body.expires_at || null,
      signing_token: signingToken,
      signing_token_expires_at: signingTokenExpiresAt,
      acknowledgments: body.acknowledgments || {},
      has_buyer_signature: body.has_buyer_signature || false,
      has_cobuyer_signature: body.has_cobuyer_signature || false,
      has_dealer_signature: body.has_dealer_signature || false,
      has_buyer_id: body.has_buyer_id || false,
      completed_link: completedLink || null,
      portal_data: portalData || null,
      language: body.language || 'en',
      // Renewal chain: if present, links this agreement back to the parent
      // so payment_schedules can be reconciled (old one closed, new one created).
      parent_agreement_id: body.parent_agreement_id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// ============================================================
// PATCH — Admin only
// ============================================================

export async function PATCH(req: NextRequest) {
  const authError = await requireAdmin(req, 'documents:manage');
  if (authError) return authError;

  const supabase = createServiceClient();
  const body = await req.json();

  if (!body.id) {
    return NextResponse.json({ error: 'Missing agreement id' }, { status: 400 });
  }

  // Trash / Restore actions
  if (body.action === 'trash') {
    // A sale's filed or voided document stays on the sale's record.
    const held = await saleDocumentIsFiled(supabase, body.id);
    if (held === 'unknown') {
      return NextResponse.json({ error: 'The document could not be checked.' }, { status: 500 });
    }
    if (held) {
      return NextResponse.json({ error: FILED_DOCUMENT_IS_FIXED }, { status: 409 });
    }
    const { data, error } = await supabase
      .from('document_agreements')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', body.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (body.action === 'restore') {
    const { data, error } = await supabase
      .from('document_agreements')
      .update({ deleted_at: null })
      .eq('id', body.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const updates: Record<string, unknown> = {};
  if (body.status) {
    updates.status = body.status;
    if (body.status === 'completed') updates.completed_at = new Date().toISOString();
  }
  if (body.buyer_name !== undefined) updates.buyer_name = body.buyer_name;
  if (body.buyer_email !== undefined) updates.buyer_email = body.buyer_email;
  if (body.buyer_phone !== undefined) updates.buyer_phone = body.buyer_phone;
  if (body.acknowledgments !== undefined) updates.acknowledgments = body.acknowledgments;
  if (body.has_buyer_signature !== undefined) updates.has_buyer_signature = body.has_buyer_signature;
  if (body.has_cobuyer_signature !== undefined) updates.has_cobuyer_signature = body.has_cobuyer_signature;
  if (body.has_dealer_signature !== undefined) updates.has_dealer_signature = body.has_dealer_signature;
  if (body.has_buyer_id !== undefined) updates.has_buyer_id = body.has_buyer_id;
  if (body.completed_link !== undefined) updates.completed_link = body.completed_link;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  /*
    A sale's filed document is never rewritten in place (owner's decision
    10/02/2026): its printed payload and its status are what was agreed, and
    a correction is a void and a new filing. Checked only when this patch
    would change either.
  */
  if (updates.completed_link !== undefined || updates.status !== undefined) {
    const held = await saleDocumentIsFiled(supabase, body.id);
    if (held === 'unknown') {
      return NextResponse.json({ error: 'The document could not be checked.' }, { status: 500 });
    }
    if (held) {
      return NextResponse.json({ error: FILED_DOCUMENT_IS_FIXED }, { status: 409 });
    }
  }

  /*
    A finished link set here is checked as one posted to POST is: a fee
    document's fees within the limits, and the documentary fee notice's
    stamp on it. A link that cannot be decoded is passed through as before:
    every print path decodes it with this same decoder, so it prints no
    figure at all (a draft's placeholder link is one).
  */
  if (typeof updates.completed_link === 'string' && updates.completed_link !== '') {
    const { data: row, error: rowError } = await supabase
      .from('document_agreements')
      .select('id, deal_id, document_type, language')
      .eq('id', body.id)
      .single();
    if (rowError || !row) {
      return NextResponse.json({ error: 'The document could not be checked.' }, { status: 500 });
    }
    const held = row as { deal_id?: string | null; document_type?: string | null; language?: string | null };
    if (held.document_type && FEE_DOCUMENTS.has(held.document_type)) {
      const decoded = decodeCompletedLinkFromUrl(updates.completed_link);
      if (decoded) {
        const refused = await feeDocumentRefusal(held.deal_id ?? null, [
          { ...(decoded.dd ?? {}), ...(decoded.cd ?? {}) } as Record<string, unknown>,
        ]);
        if (refused) return refused;
        updates.completed_link =
          withCompletedLinkDealerData(updates.completed_link, noticeStamp(held.language)) ?? updates.completed_link;
      }
    }
  }

  const { data, error } = await supabase
    .from('document_agreements')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

const FILED_DOCUMENT_IS_FIXED =
  "This document is filed on a sale and is kept as it was filed. Void the bill of sale from the sale's paperwork and file it again instead.";

/**
 * Whether a row is a sale's filed (or voided) document: deal-linked, and
 * filed by the desk's own rule or voided. "unknown" when it cannot be read.
 */
async function saleDocumentIsFiled(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
): Promise<boolean | 'unknown'> {
  const { data, error } = await supabase
    .from('document_agreements')
    .select('id, deal_id, document_type, status, finalized_at, completed_at, voided_at')
    .eq('id', id)
    .single();
  if (error) return 'unknown';
  const row = data as (FiledAgreementRow & { deal_id?: string | null; voided_at?: string | null }) | null;
  if (!row || !row.deal_id) return false;
  return Boolean(row.voided_at) || isFiledAgreement(row);
}
