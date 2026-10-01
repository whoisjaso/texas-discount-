import { NextRequest, NextResponse } from 'next/server';
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
      completed_link: body.completed_link || null,
      portal_data: body.portal_data || null,
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
