import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { decodeCompletedLinkFromUrl } from '@/lib/documents/customerPortal';
import { DocumentSheet, KNOWN_SECTIONS } from '@/components/documents/DocumentSheet';
import {
  hydrateAgreementForPdf,
  mergeLiveRentalAgreementPayload,
} from '@/lib/rentals/agreement-to-pdf';

// ============================================================
// Internal render route for PDF generation via Puppeteer.
// URL: /documents/render/[id]?copy=BUYER+COPY
// Auth: x-internal-render-token request header
// ============================================================

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ copy?: string; signatures?: string; idimg?: string }>;
}

export default async function RenderPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { copy, signatures: signatureMode, idimg } = await searchParams;
  const includeSignatureImages = signatureMode !== 'blank' && signatureMode !== '0';
  // The buyer-delivery render: signatures stay, the licence photographs go.
  const includeIdImagery = idimg !== '0';

  // Auth: require internal render token
  const expectedToken = process.env.INTERNAL_RENDER_TOKEN;
  const requestHeaders = await headers();
  const suppliedToken = requestHeaders.get('x-internal-render-token');
  if (!expectedToken || suppliedToken !== expectedToken) {
    notFound();
  }

  // The token above is the auth boundary for this internal renderer. Use the
  // service client so Puppeteer renders do not depend on browser/admin cookies.
  const supabase = createServiceClient();
  const { data: agreement, error } = await supabase
    .from('document_agreements')
    .select('completed_link, document_type, status, form_data, buyer_name, vehicle_description, vehicle_vin, finalized_at')
    .eq('id', id)
    .single();

  if (error || !agreement) {
    notFound();
  }

  // Prefer the completed-link payload for finalized customer docs. Rental
  // agreements created through /admin/rentals may not have completed_link, so
  // hydrate them from the live agreement/customer/vehicle rows instead.
  const archived = agreement.completed_link
    ? decodeCompletedLinkFromUrl(agreement.completed_link)
    : null;
  const liveRental = agreement.document_type === 'rental'
    ? await hydrateAgreementForPdf(supabase, id)
    : null;
  const decoded = liveRental
    ? mergeLiveRentalAgreementPayload(liveRental, archived, includeSignatureImages)
    : archived;

  if (!decoded) {
    /*
      A filed row with no completed link. Corridor rows written before the
      link existed, and types no preview knows, still hold their whole record
      in form_data, and a person at a printer is owed that record on paper
      rather than a 500. A plain summary sheet, honestly labelled.
    */
    const filed =
      agreement.form_data && typeof agreement.form_data === 'object'
        ? (agreement.form_data as Record<string, unknown>)
        : null;
    if (!filed) notFound();
    return (
      <FiledRecordSheet
        documentType={agreement.document_type as string}
        buyerName={(agreement.buyer_name as string) ?? ''}
        vehicle={(agreement.vehicle_description as string) ?? ''}
        vin={(agreement.vehicle_vin as string) ?? ''}
        filedAt={(agreement.finalized_at as string) ?? ''}
        formData={filed}
      />
    );
  }

  // A section this renderer does not draw is a 404, as it always was.
  if (!KNOWN_SECTIONS.has(decoded.s)) notFound();
  return (
    <DocumentSheet
      decoded={decoded}
      includeSignatureImages={includeSignatureImages}
      includeIdImagery={includeIdImagery}
      copyLabel={copy || undefined}
    />
  );

}

/**
 * The record as filed, for a document no preview knows how to draw.
 *
 * Machine keys are spaced into words and values printed as given. It is not
 * pretty and it is not meant to be: it is the difference between a printer
 * and an error screen on the one day somebody needs the record.
 */
function FiledRecordSheet({
  documentType,
  buyerName,
  vehicle,
  vin,
  filedAt,
  formData,
}: {
  documentType: string;
  buyerName: string;
  vehicle: string;
  vin: string;
  filedAt: string;
  formData: Record<string, unknown>;
}) {
  const title = documentType
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/^./, (first) => first.toUpperCase());
  const rows = Object.entries(formData).filter(
    ([key, value]) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== '' &&
      !/signature|signedAt/i.test(key) &&
      typeof value !== 'object',
  );
  return (
    <main style={{ fontFamily: 'Georgia, serif', color: '#1a1a1a', padding: '48px', maxWidth: '640px' }}>
      <h1 style={{ fontSize: '22px', marginBottom: '2px' }}>{title}</h1>
      <p style={{ fontSize: '13px', margin: '0 0 24px', color: '#555' }}>
        As filed{filedAt ? ` ${new Date(filedAt).toLocaleDateString('en-US')}` : ''}
        {buyerName ? ` for ${buyerName}` : ''}
        {vehicle ? `, ${vehicle}` : ''}
        {vin ? ` (VIN ${vin})` : ''}.
      </p>
      <dl style={{ fontSize: '14px', lineHeight: 1.7 }}>
        {rows.map(([key, value]) => (
          <div key={key} style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #e2ded6', padding: '6px 0' }}>
            <dt style={{ width: '220px', color: '#555' }}>
              {key.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (first) => first.toUpperCase())}
            </dt>
            <dd style={{ margin: 0 }}>{String(value)}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
