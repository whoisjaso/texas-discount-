import { brand } from "@/lib/dealership-config";
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { generatePdf } from '@/lib/documents/pdf-generator';
import { createServiceClient } from '@/lib/supabase/service';

// GET /api/documents/agreements/[id]/pdf?copy=BUYER+COPY
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdmin(req, 'documents:read');
  if (authError) return authError;

  const { id } = await params;
  const url = new URL(req.url);
  const copy = url.searchParams.get('copy') || 'BUYER COPY';
  const inline = url.searchParams.get('inline') === 'true';
  const signatureParam = (url.searchParams.get('signatures') || 'digital').toLowerCase();
  const includeSignatures = signatureParam !== 'blank' && signatureParam !== '0';

  const supabase = createServiceClient();
  const { data: agreement, error } = await supabase
    .from('document_agreements')
    .select('id, vehicle_description, buyer_name, document_type, deal_id, form_data')
    .eq('id', id)
    .single();

  if (error || !agreement) {
    return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
  }

  /**
   * The power of attorney is a state form too, and it is signed in ink.
   *
   * Its filed row records which instrument was used. The plain VTR-271 is
   * printed from the official template by its own route, from the deal, so
   * that is where the packet's Open goes. The county's secure VTR-271-A is
   * a controlled paper form that cannot be printed from here at all, and
   * the row says so rather than the packet answering with a server error,
   * which is what every filed power of attorney used to get: this route
   * rendered it through the HTML pipeline, which has no such page.
   */
  if (agreement.document_type === 'powerOfAttorney') {
    const form = (agreement.form_data ?? {}) as Record<string, unknown>;
    if (form.instrument === 'VTR-271-A') {
      return NextResponse.json(
        {
          error:
            'This power of attorney was signed on the county\'s secure form (VTR-271-A), which is a controlled paper form and is not printed from here. The signed original is the record.',
        },
        { status: 409 },
      );
    }
    const dealId = typeof agreement.deal_id === 'string' ? agreement.deal_id : '';
    if (!dealId) {
      return NextResponse.json({ error: 'This power of attorney is not attached to a sale.' }, { status: 404 });
    }
    const target = new URL('/api/documents/power-of-attorney', req.url);
    target.searchParams.set('dealId', dealId);
    target.searchParams.set('disposition', inline ? 'inline' : 'attachment');
    return NextResponse.redirect(target, 307);
  }

  /**
   * The 130-U is a state form, not one of ours.
   *
   * Every other document here is rendered from our own HTML and printed to
   * paper, which is right, because we wrote them. The 130-U is not ours: it
   * is the TxDMV's, it lives at public/forms/130-U.pdf, and it has real form
   * fields. Rendering a lookalike of it and handing that to a county tax
   * office is a rejection waiting to happen, so this branch fills the actual
   * form instead. Drafts carry `completed_link` too, so a preview shows the
   * same bytes the filing would.
   */
  if (agreement.document_type === "form130U") {
    const { render130UPdf } = await import("@/lib/documents/render130U");
    const filled = await render130UPdf(id);
    if (!filled.ok) {
      return NextResponse.json({ error: filled.error }, { status: filled.status });
    }
    return new NextResponse(new Uint8Array(filled.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filled.filename}"`,
      },
    });
  }

  try {
    const pdfBytes = await generatePdf({ agreementId: id, copyLabel: copy, includeSignatures });

    const docTypeLabels: Record<string, string> = {
      billOfSale: 'BillOfSale',
      financing: 'Financing',
      rental: 'Rental',
      form130U: 'Form130U',
      vehicleResponsibility: 'VehicleResponsibility',
      insuranceAcknowledgment: 'InsuranceAcknowledgment',
      rebuiltDisclosure: 'RebuiltTitleDisclosure',
      powerOfAttorney: 'PowerOfAttorney',
      salvageBillOfSale: 'SalvageBillOfSale',
      towAwayAcknowledgment: 'TowAwayAcknowledgment',
      buyerResponsibilityStatement: 'BuyerResponsibilityStatement',
    };
    const docLabel = docTypeLabels[agreement.document_type] || 'Document';
    const safeName = (agreement.buyer_name || 'Customer')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${brand.filePrefix}_${docLabel}_${safeName}_${dateStr}.pdf`;

    const disposition = inline ? 'inline' : 'attachment';
    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
      },
    });
  } catch (e) {
    const errMsg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    console.error('[pdf] Generation failed:', errMsg);
    return NextResponse.json(
      { error: 'PDF generation failed', details: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}
