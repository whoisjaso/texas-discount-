import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveAgreement, type SaveAgreementParams, type SaveAgreementResult } from '@/lib/documents/customerPortal';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

const baseParams: SaveAgreementParams = {
  documentType: 'billOfSale',
  data: { buyerName: 'John Doe', vehicleYear: '2020', vehicleMake: 'Toyota', vehicleModel: 'Camry' },
  status: 'pending',
};

describe('saveAgreement return type', () => {
  it('returns { success: true, id } on successful create', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'abc-123' }),
    });

    const result: SaveAgreementResult = await saveAgreement(baseParams);
    expect(result.success).toBe(true);
    expect(result.id).toBe('abc-123');
    expect(result.error).toBeUndefined();
  });

  it('returns { success: true, id } on successful complete', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'existing-id' }),
    });

    const result = await saveAgreement({
      ...baseParams,
      status: 'completed',
      agreementId: 'existing-id',
    });
    expect(result.success).toBe(true);
    expect(result.id).toBe('existing-id');
  });

  it('returns { success: false, error } on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await saveAgreement(baseParams);
    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('returns { success: false, error } on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await saveAgreement(baseParams);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('returns { success: false, error } on unknown error', async () => {
    mockFetch.mockRejectedValueOnce('string error');

    const result = await saveAgreement(baseParams);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error');
  });

  it('uses correct endpoint for pending (create)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'new-id' }),
    });

    await saveAgreement(baseParams);
    expect(mockFetch).toHaveBeenCalledWith('/api/documents/agreements', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('uses correct endpoint for completed (update)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'existing-id' }),
    });

    await saveAgreement({
      ...baseParams,
      status: 'completed',
      agreementId: 'existing-id',
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/documents/agreements/complete', expect.objectContaining({
      method: 'POST',
    }));
  });
});
