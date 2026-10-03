import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { TeamRole } from '@/lib/operations/team';

// Mock Supabase — includes auth.getUser() for requireAdmin
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockNot = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockRosterSelect = vi.fn();
const mockRosterEq = vi.fn();
const mockRosterMaybeSingle = vi.fn();

type MockOrderResponse = {
  data: Array<Record<string, unknown>> | Record<string, unknown> | null;
  error: { message?: string; code?: string; details?: string } | null;
};

function defaultAgreementRow(): Record<string, unknown> {
  return {
    id: '1',
    document_type: 'billOfSale',
    status: 'pending',
    signing_token: 'leaked-token',
    signing_token_expires_at: '2030-01-01T00:00:00.000Z',
  };
}

let mockOrderResponses: MockOrderResponse[] = [];
let mockSelectSingleResponses: MockOrderResponse[] = [];

function nextOrderResponse(): MockOrderResponse {
  return mockOrderResponses.shift() ?? { data: [defaultAgreementRow()], error: null };
}

function nextSelectSingleResponse(): MockOrderResponse {
  return (
    mockSelectSingleResponses.shift() ?? {
      data: { ...defaultAgreementRow(), status: 'completed' },
      error: null,
    }
  );
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => {
      mockFrom(table);
      return {
        select: (cols: string) => {
          mockSelect(cols);
          const query = {
            not: (col: string, operator: string, val: string) => {
              mockNot(col, operator, val);
              return query;
            },
            order: (col: string, opts: Record<string, boolean>) => {
              mockOrder(col, opts);
              return nextOrderResponse();
            },
            eq: (col: string, val: string) => {
              mockEq(col, val);
              return query;
            },
            single: () => {
              mockSingle();
              return nextSelectSingleResponse();
            },
          };
          return query;
        },
        insert: (data: Record<string, unknown>) => {
          mockInsert(data);
          return {
            select: () => ({
              single: () => {
                mockSingle();
                return { data: { id: '1', ...data }, error: null };
              },
            }),
          };
        },
        update: (data: Record<string, unknown>) => {
          mockUpdate(data);
          return {
            eq: (col: string, val: string) => {
              mockEq(col, val);
              return {
                select: () => ({
                  single: () => {
                    mockSingle();
                    return { data: { id: val, ...data }, error: null };
                  },
                }),
              };
            },
          };
        },
      };
    },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
      mockFrom(table);
      if (table === 'team_members') {
        return {
          select: (cols: string) => {
            mockRosterSelect(cols);
            const query = {
              eq: (col: string, val: string) => {
                mockRosterEq(col, val);
                return query;
              },
              maybeSingle: () => mockRosterMaybeSingle(),
            };
            return query;
          },
        };
      }
      return {
        select: (cols: string) => {
          mockSelect(cols);
          const query = {
            not: (col: string, operator: string, val: string) => {
              mockNot(col, operator, val);
              return query;
            },
            order: (col: string, opts: Record<string, boolean>) => {
              mockOrder(col, opts);
              return nextOrderResponse();
            },
            eq: (col: string, val: string) => {
              mockEq(col, val);
              return query;
            },
            single: () => {
              mockSingle();
              return nextSelectSingleResponse();
            },
          };
          return query;
        },
        insert: (data: Record<string, unknown>) => {
          mockInsert(data);
          return {
            select: () => ({
              single: () => {
                mockSingle();
                return { data: { id: '1', ...data }, error: null };
              },
            }),
          };
        },
        update: (data: Record<string, unknown>) => {
          mockUpdate(data);
          return {
            eq: (col: string, val: string) => {
              mockEq(col, val);
              return {
                select: () => ({
                  single: () => {
                    mockSingle();
                    return { data: { id: val, ...data }, error: null };
                  },
                }),
              };
            },
          };
        },
      };
    },
  })),
}));

vi.mock('@/lib/auth/admin-device-session', () => ({
  ADMIN_DEVICE_SESSION_COOKIE: 'tj-admin-device-session',
  isValidAdminDeviceSession: vi.fn(() => Promise.resolve(true)),
}));

/** Keep stale owner metadata so authorization must honor the current roster. */
function setAuthenticated(role: TeamRole = 'manager', status = 'active') {
  mockRosterMaybeSingle.mockResolvedValue({ data: { role, status }, error: null });
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'admin-1',
        email: 'admin@test.com',
        app_metadata: { access_status: 'active', desk_role: 'owner' },
      },
    },
    error: null,
  });
}

/** Set mockGetUser to return unauthenticated */
function setUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function makeRequest(method: string, body?: Record<string, unknown>): NextRequest {
  return new NextRequest(new URL('http://localhost/api/documents/agreements'), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Import route handlers after mocks are set up
const { GET, POST, PATCH } = await import('@/app/api/documents/agreements/route');
const agreementDetailRoute = await import('@/app/api/documents/agreements/[id]/route');

beforeEach(() => {
  // The fixture is a staff member, never the configured-owner bypass.
  vi.stubEnv('ADMIN_EMAIL', 'owner@example.test');
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/documents/agreements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderResponses = [];
    mockSelectSingleResponses = [];
  });

  it('returns 401 without admin session', async () => {
    setUnauthenticated();
    const req = makeRequest('GET');
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 with expired/invalid session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } });
    const req = makeRequest('GET');
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(401);
  });

  it('returns agreements with valid admin session', async () => {
    setAuthenticated();
    const req = makeRequest('GET');
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(mockRosterSelect).toHaveBeenCalledWith('role,status');
    expect(mockRosterEq).toHaveBeenCalledWith('auth_user_id', 'admin-1');
    expect(mockRosterMaybeSingle).toHaveBeenCalledOnce();
  });

  it('allows sales staff to read agreements under their current roster role', async () => {
    setAuthenticated('sales');
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith('document_agreements');
  });

  it.each(['pending', 'inactive'])('denies a %s member despite active owner metadata', async (status) => {
    setAuthenticated('manager', status);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(mockFrom).not.toHaveBeenCalledWith('document_agreements');
  });

  it('denies an active role without document read permission despite owner metadata', async () => {
    setAuthenticated('mechanic');
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalledWith('document_agreements');
  });

  it('fails closed when the authoritative roster cannot be read', async () => {
    setAuthenticated();
    mockRosterMaybeSingle.mockResolvedValue({ data: null, error: { code: '08006' } });
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(503);
    expect(mockFrom).not.toHaveBeenCalledWith('document_agreements');
  });

  it('uses explicit column list (not select *)', async () => {
    setAuthenticated();
    const req = makeRequest('GET');
    await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(mockSelect).toHaveBeenCalledWith(expect.not.stringContaining('*'));
    expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('id'));
    expect(mockSelect).toHaveBeenCalledWith(expect.not.stringContaining('completed_link'));
    expect(mockSelect).toHaveBeenCalledWith(expect.not.stringContaining('signing_token'));
  });

  it('redacts signing credentials from list responses', async () => {
    setAuthenticated();
    mockOrderResponses = [{ data: [defaultAgreementRow()], error: null }];
    const req = makeRequest('GET');
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body[0]).not.toHaveProperty('signing_token');
    expect(body[0]).not.toHaveProperty('signing_token_expires_at');
  });

  it('redacts signing credentials from fallback select star responses', async () => {
    setAuthenticated();
    mockOrderResponses = [
      { data: null, error: { message: 'column does not exist', code: '42703' } },
      {
        data: [
          {
            ...defaultAgreementRow(),
            completed_link: 'large-completed-link',
            buyer_id_photo: 'private-photo',
          },
        ],
        error: null,
      },
    ];
    const req = makeRequest('GET');
    const res = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(body[0]).not.toHaveProperty('signing_token');
    expect(body[0]).not.toHaveProperty('signing_token_expires_at');
    expect(body[0]).not.toHaveProperty('completed_link');
    expect(body[0]).not.toHaveProperty('buyer_id_photo');
  });
});

describe('GET /api/documents/agreements/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderResponses = [];
    mockSelectSingleResponses = [];
  });

  it('redacts signing credentials from read-only detail responses', async () => {
    setAuthenticated();
    mockSelectSingleResponses = [
      {
        data: {
          ...defaultAgreementRow(),
          completed_link: 'completed-document-data',
          buyer_id_photo: 'private-photo',
        },
        error: null,
      },
    ];
    const req = makeRequest('GET');
    const res = await agreementDetailRoute.GET(req, {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      id: '1',
      completed_link: 'completed-document-data',
      buyer_id_photo: 'private-photo',
    });
    expect(body).not.toHaveProperty('signing_token');
    expect(body).not.toHaveProperty('signing_token_expires_at');
  });

  it('keeps completed customer portal links behind documents manage', async () => {
    setAuthenticated();
    mockSelectSingleResponses = [
      {
        data: {
          id: '1',
          status: 'completed',
          signing_token: 'secure-token',
        },
        error: null,
      },
    ];
    const req = makeRequest('POST', { action: 'completedPortalLink' });
    const res = await agreementDetailRoute.POST(req, {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.href).toContain('/documents/portal?');
    expect(body.href).toContain('id=1');
    expect(body.href).toContain('view=completed');
    expect(body.href).toContain('token=secure-token');
  });

  it('blocks read-only sales staff from obtaining customer portal credentials', async () => {
    setAuthenticated('sales');
    const res = await agreementDetailRoute.POST(
      makeRequest('POST', { action: 'completedPortalLink' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalledWith('document_agreements');
  });
});

describe('POST /api/documents/agreements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderResponses = [];
    mockSelectSingleResponses = [];
  });

  it('returns 401 without admin session', async () => {
    setUnauthenticated();
    const req = makeRequest('POST', {
      document_type: 'billOfSale',
      buyer_name: 'John Doe',
      status: 'pending',
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(401);
  });

  it('creates agreement with admin auth', async () => {
    setAuthenticated();
    const req = makeRequest('POST', {
      document_type: 'billOfSale',
      buyer_name: 'John Doe',
      status: 'pending',
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        document_type: 'billOfSale',
        buyer_name: 'John Doe',
        status: 'pending',
        signing_token: expect.any(String),
        signing_token_expires_at: expect.any(String),
        expires_at: expect.any(String),
      }),
    );
  });

  it('blocks sales staff from creating agreements despite stale owner metadata', async () => {
    setAuthenticated('sales');
    const res = await POST(makeRequest('POST', { document_type: 'billOfSale' }));
    expect(res.status).toBe(403);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalledWith('document_agreements');
  });

  it('returns 400 without document_type', async () => {
    setAuthenticated();
    const req = makeRequest('POST', { buyer_name: 'John' });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Missing document_type');
  });

  it('sets completed_at when status is completed', async () => {
    setAuthenticated();
    const req = makeRequest('POST', {
      document_type: 'billOfSale',
      status: 'completed',
    });
    await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_at: expect.any(String),
      }),
    );
  });

  it('sets completed_at to null when status is pending', async () => {
    setAuthenticated();
    const req = makeRequest('POST', {
      document_type: 'billOfSale',
      status: 'pending',
    });
    await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_at: null,
      }),
    );
  });
});

describe('PATCH /api/documents/agreements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderResponses = [];
    mockSelectSingleResponses = [];
  });

  it('returns 401 without admin session', async () => {
    setUnauthenticated();
    const req = makeRequest('PATCH', { id: '123', status: 'completed' });
    const res = await PATCH(req as unknown as Parameters<typeof PATCH>[0]);
    expect(res.status).toBe(401);
  });

  it('returns 400 without id', async () => {
    setAuthenticated();
    const req = makeRequest('PATCH', { status: 'completed' });
    const res = await PATCH(req as unknown as Parameters<typeof PATCH>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Missing agreement id');
  });

  it('blocks sales staff from changing agreements despite stale owner metadata', async () => {
    setAuthenticated('sales');
    const res = await PATCH(makeRequest('PATCH', { id: '123', status: 'completed' }));
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalledWith('document_agreements');
  });

  it('returns 400 with no fields to update', async () => {
    setAuthenticated();
    const req = makeRequest('PATCH', { id: '123' });
    const res = await PATCH(req as unknown as Parameters<typeof PATCH>[0]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('No fields to update');
  });

  it('updates has_dealer_signature (was previously missing)', async () => {
    setAuthenticated();
    const req = makeRequest('PATCH', { id: '123', has_dealer_signature: true });
    const res = await PATCH(req as unknown as Parameters<typeof PATCH>[0]);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ has_dealer_signature: true }),
    );
  });

  it('allows setting buyer_name to empty string (uses !== undefined, not falsy)', async () => {
    setAuthenticated();
    const req = makeRequest('PATCH', { id: '123', buyer_name: '' });
    const res = await PATCH(req as unknown as Parameters<typeof PATCH>[0]);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ buyer_name: '' }),
    );
  });
});
