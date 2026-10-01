import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { generateCompletedPortalLink } from '@/lib/documents/customerPortal';
import { createServiceClient } from '@/lib/supabase/service';

function redactAgreementDetailRow(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row };
  delete rest.signing_token;
  delete rest.signing_token_expires_at;
  return rest;
}

// GET single agreement by ID — includes buyer_id_photo and completed_link
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(req, 'documents:read');
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('document_agreements')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json(redactAgreementDetailRow(data as Record<string, unknown>));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(req, 'documents:manage');
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  if (body.action !== 'completedPortalLink') {
    return NextResponse.json({ error: 'Unsupported agreement action' }, { status: 400 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('document_agreements')
    .select('id,status,signing_token,language')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Agreement not found' }, { status: 404 });
  }

  const row = data as {
    id: string;
    status: string;
    signing_token: string | null;
    language: string | null;
  };

  if (row.status !== 'completed' && row.status !== 'finalized') {
    return NextResponse.json({ error: 'Agreement is not completed' }, { status: 409 });
  }

  if (!row.signing_token) {
    return NextResponse.json({ error: 'Signing token needs to be reissued' }, { status: 410 });
  }

  return NextResponse.json({
    href: generateCompletedPortalLink('', row.id, row.signing_token, row.language),
  });
}
