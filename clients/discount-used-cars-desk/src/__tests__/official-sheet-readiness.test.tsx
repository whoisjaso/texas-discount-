// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const pdf = vi.hoisted(() => ({ secondPage: Promise.resolve() as Promise<void>, failFetch: false, image: 0 }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({ destroy: async () => {}, promise: Promise.resolve({ numPages: 2, getPage: async (number: number) => ({ getViewport: () => ({ width: 612, height: 792 }), render: () => ({ promise: number === 2 ? pdf.secondPage : Promise.resolve() }) }), destroy: async () => {} }) }) }));
vi.mock('@/lib/documents/official-rebuilt-disclosure', () => ({ fillOfficialRebuiltDisclosure: async () => new Uint8Array([37, 80, 68, 70]) }));
import OfficialFormSheet from '@/app/sign/packet/[token]/OfficialFormSheet';
import OfficialRebuiltDisclosureDocument from '@/components/documents/OfficialRebuiltDisclosureDocument';

function deferred() { let resolve!: () => void; let reject!: () => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function load(image: HTMLImageElement, decode = Promise.resolve()) {
  Object.defineProperties(image, { complete: { configurable: true, value: true }, naturalWidth: { configurable: true, value: 612 }, naturalHeight: { configurable: true, value: 792 } });
  image.decode = vi.fn(() => decode);
  fireEvent.load(image);
}
const facts = { year: '2003', make: 'Honda', vin: '1HGCM82633A004352', buyerName: 'Avery Collins' };
beforeEach(() => {
  pdf.secondPage = Promise.resolve(); pdf.failFetch = false; pdf.image = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: !pdf.failFetch, status: pdf.failFetch ? 500 : 200, arrayBuffer: async () => new ArrayBuffer(4) })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({}) as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => `data:image/png;base64,page${++pdf.image}`);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('official signing sheet readiness', () => {
  it('waits for every rendered PDF page and its image decoding before becoming ready', async () => {
    const second = deferred(); pdf.secondPage = second.promise;
    const view = render(<OfficialFormSheet src='/official-a.pdf' title='State Form' />);
    const marker = () => view.container.querySelector('[data-sign-ready]')?.getAttribute('data-sign-ready');
    expect(marker()).toBe('false');
    await waitFor(() => expect(view.container.querySelectorAll('img')).toHaveLength(1));
    await act(async () => load(view.container.querySelector('img')!));
    expect(marker()).toBe('false');
    await act(async () => second.resolve());
    await waitFor(() => expect(view.container.querySelectorAll('img')).toHaveLength(2));
    const decoded = deferred();
    await act(async () => load(view.container.querySelectorAll('img')[1], decoded.promise));
    expect(marker()).toBe('false');
    await act(async () => decoded.resolve());
    expect(marker()).toBe('true');
    view.rerender(<OfficialFormSheet src='/official-b.pdf' title='Other Form' />);
    expect(marker()).toBe('false');
    view.rerender(<OfficialFormSheet src='/official-a.pdf' title='State Form' />);
    expect(marker()).toBe('false');
  });
  it('keeps a failed later PDF page unready even if the first page loaded', async () => {
    const second = deferred(); pdf.secondPage = second.promise;
    const view = render(<OfficialFormSheet src='/broken.pdf' title='State Form' />);
    await waitFor(() => expect(view.container.querySelector('img')).not.toBeNull());
    await act(async () => load(view.container.querySelector('img')!));
    await act(async () => second.reject());
    expect(view.container.querySelector('[data-sign-ready]')?.getAttribute('data-sign-ready')).toBe('false');
    expect(view.getByRole('alert').textContent).toContain('Ask the desk to print it.');
  });
  it('requires the rebuilt disclosure image to decode and clears readiness for changed facts', async () => {
    const view = render(<OfficialRebuiltDisclosureDocument data={facts} />);
    const marker = () => view.container.querySelector('[data-sign-ready]')?.getAttribute('data-sign-ready');
    expect(marker()).toBe('false');
    await waitFor(() => expect(view.container.querySelector('img')).not.toBeNull());
    const decoded = deferred();
    await act(async () => load(view.container.querySelector('img')!, decoded.promise));
    expect(marker()).toBe('false');
    await act(async () => decoded.resolve());
    expect(marker()).toBe('true');
    view.rerender(<OfficialRebuiltDisclosureDocument data={{ ...facts, buyerName: 'Another Buyer' }} />);
    expect(marker()).toBe('false');
  });
  it('retains an earlier image failure when a later page finishes rendering', async () => {
    const second = deferred(); pdf.secondPage = second.promise;
    const view = render(<OfficialFormSheet src='/image-failure.pdf' title='State Form' />);
    await waitFor(() => expect(view.container.querySelectorAll('img')).toHaveLength(1));
    fireEvent.error(view.container.querySelector('img')!);
    await act(async () => second.resolve());
    await waitFor(() => expect(view.container.querySelectorAll('img')).toHaveLength(2));
    await act(async () => load(view.container.querySelectorAll('img')[1]));
    expect(view.container.querySelector('[data-sign-ready]')?.getAttribute('data-sign-ready')).toBe('false');
    expect(view.getByRole('alert').textContent).toContain('Ask the desk to print it.');
  });
  it('never becomes ready after an image or document-fetch failure', async () => {
    const view = render(<OfficialRebuiltDisclosureDocument data={facts} />);
    await waitFor(() => expect(view.container.querySelector('img')).not.toBeNull());
    fireEvent.error(view.container.querySelector('img')!);
    expect(view.container.querySelector('[data-sign-ready]')?.getAttribute('data-sign-ready')).toBe('false');
    expect(view.getByRole('alert')).toBeTruthy();
    pdf.failFetch = true;
    fireEvent.click(view.getByRole('button', { name: 'Try Again' }));
    await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
    expect(view.container.querySelector('[data-sign-ready]')?.getAttribute('data-sign-ready')).toBe('false');
  });
});
