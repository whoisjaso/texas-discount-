import puppeteer from 'puppeteer-core';
import { createServiceClient } from '@/lib/supabase/service';
import { existsSync } from 'fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeCompletedLinkFromUrl } from '@/lib/documents/customerPortal';
import { fillOfficialRebuiltDisclosure, officialRebuiltDataFromLink } from '@/lib/documents/official-rebuilt-disclosure';

// ============================================================
// PDF Generator — Puppeteer renders HTML preview to PDF
//
// FLOW:
//   1. Verify agreement exists in Supabase
//   2. Launch headless Chromium
//   3. Navigate to /documents/render/[id] (same React components)
//   4. Wait for .print-doc selector (proves real doc, not error page)
//   5. Generate PDF with page.pdf()
//   6. Return PDF buffer
//
// The render route uses BillOfSalePreview, ContractPreview, or
// RentalPreview — so the PDF matches the HTML preview exactly.
//
//  ┌────────────┐     ┌──────────────────┐     ┌───────────┐
//  │ API Route  │────►│  generatePdf()   │────►│ Chromium  │
//  │ or Finalize│     │  launch browser  │     │ headless  │
//  └────────────┘     └──────────────────┘     └─────┬─────┘
//                                                    │
//                     ┌──────────────────┐           │
//                     │ /documents/      │◄──────────┘
//                     │ render/[id]      │  page.goto()
//                     │ (Server Comp.)   │
//                     └────────┬─────────┘
//                              │
//                     ┌────────▼─────────┐
//                     │ Preview Component│
//                     │ + Tailwind CSS   │
//                     │ + Print CSS      │
//                     └────────┬─────────┘
//                              │
//                     ┌────────▼─────────┐
//                     │   page.pdf()     │
//                     │   Letter size    │
//                     │   @media print   │
//                     └──────────────────┘
// ============================================================

const IS_SERVERLESS =
  process.env.NODE_ENV !== 'development' &&
  !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION);

// Common Chrome install paths by platform
const LOCAL_CHROME_PATHS: Record<string, string[]> = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ],
};

function getBaseUrl(): string {
  if (process.env.INTERNAL_RENDER_BASE_URL) {
    return process.env.INTERNAL_RENDER_BASE_URL.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return `http://127.0.0.1:${process.env.PORT || 3000}`;
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `http://localhost:${process.env.PORT || 3000}`;
}

async function getLocalChromePath(): Promise<string> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const paths = LOCAL_CHROME_PATHS[process.platform] || [];
  for (const p of paths) {
    if (p && existsSync(p)) return p;
  }

  throw new Error(
    `Chrome not found. Install Google Chrome or set CHROME_PATH env var.\n` +
    `Searched: ${paths.filter(Boolean).join(', ')}`,
  );
}

async function launchBrowser() {
  if (IS_SERVERLESS) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 1600 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1200, height: 1600 },
    executablePath: await getLocalChromePath(),
    headless: true,
  });
}

export async function generatePdf({
  agreementId,
  copyLabel,
  includeSignatures = true,
  stripIdImagery = false,
}: {
  agreementId: string;
  copyLabel: string;
  includeSignatures?: boolean;
  /**
   * The buyer-delivery mode: signatures stay, the embedded licence
   * photographs go. A copy that leaves the building over SMS carries the
   * record of the deal, not a reproduction of the buyer's identity
   * document.
   */
  stripIdImagery?: boolean;
}): Promise<Buffer> {
  // 1. Verify the agreement exists. Browser rendering is protected by
  // INTERNAL_RENDER_TOKEN and uses the service client after that token check,
  // so admin/rental PDFs can be generated without depending on browser cookies.
  const supabase = createServiceClient();
  const { data: agreement, error } = await supabase
    .from('document_agreements')
    .select('id, completed_link, document_type, language')
    .eq('id', agreementId)
    .single();

  if (error || !agreement) {
    throw new Error(`Agreement ${agreementId} not found`);
  }
  if (agreement.document_type === 'form130U') {
    const { render130UPdf } = await import('@/lib/documents/render130U');
    const official = await render130UPdf(agreementId, { includeSignatures, stripIdImagery });
    if (!official.ok) throw new Error(official.error);
    return Buffer.from(official.bytes);
  }
  // New state disclosures retain the official PDF page. Historical links
  // without the version marker still render the exact sheet they signed.
  if (agreement.document_type === 'rebuiltDisclosure' && agreement.completed_link) {
    const link = decodeCompletedLinkFromUrl(agreement.completed_link);
    const fields = link && officialRebuiltDataFromLink(link, includeSignatures);
    if (fields) {
      const source = await readFile(join(process.cwd(), 'public/forms/ENF-MV-RBLT-DSCLMR.pdf'));
      return Buffer.from(await fillOfficialRebuiltDisclosure(source, fields));
    }
  }
  // No completed_link is no longer a dead stop: the render route falls back
  // to the filed form_data and draws a plain record sheet, so a corridor row
  // written before links existed still comes out of the printer.

  // 2. Build render URL
  const token = process.env.INTERNAL_RENDER_TOKEN;
  if (!token) {
    throw new Error('INTERNAL_RENDER_TOKEN environment variable is required for PDF generation');
  }

  const baseUrl = getBaseUrl();
  const renderUrl = `${baseUrl}/documents/render/${agreementId}?copy=${encodeURIComponent(copyLabel)}&signatures=${includeSignatures ? 'digital' : 'blank'}${stripIdImagery ? '&idimg=0' : ''}`;

  // 3. Launch Chromium and generate PDF
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'x-internal-render-token': token,
    });

    // Navigate to render route. Do not use networkidle here: Next dev/HMR,
    // analytics, or browser extension requests can keep the network open even
    // after the document is visually ready. The real readiness contract is the
    // rendered .print-doc plus loaded fonts/images below.
    await page.goto(renderUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });

    // Verify document rendered (not an error page)
    await page.waitForSelector('.print-doc', { timeout: 10000 });
    await page.evaluate(async () => {
      await document.fonts?.ready;
      await Promise.all(
        Array.from(document.images).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        }),
      );
    });
    await page.emulateMediaType('print');

    // Generate PDF — uses @page CSS rules from globals.css
    // (Letter size, 0.35in margins, print-color-adjust: exact)
    const pdfUint8 = await page.pdf({
      format: 'letter',
      printBackground: true,
      preferCSSPageSize: true,
    });

    return Buffer.from(pdfUint8);
  } finally {
    await browser.close();
  }
}
