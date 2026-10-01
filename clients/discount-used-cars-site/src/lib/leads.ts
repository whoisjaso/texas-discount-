export type LeadType = 'vehicle-inquiry' | 'glass-quote' | 'pre-qualification' | 'contact' | 'trade-in';

export interface Lead {
  type: LeadType;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  vehicle?: string;
  details?: Record<string, string>;
}

const QUEUE_KEY = 'vegas.leads.pending';

/**
 * Sends a lead to VITE_LEADS_ENDPOINT when configured. Without an endpoint the
 * lead is kept in this browser so nothing is lost during demos; the admin
 * dashboard will own delivery once it is connected.
 */
export async function submitLead(lead: Lead): Promise<void> {
  const payload = { ...lead, submittedAt: new Date().toISOString(), source: 'website' };
  const endpoint = import.meta.env.VITE_LEADS_ENDPOINT as string | undefined;
  if (endpoint) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Lead submission failed (${res.status})`);
    return;
  }
  try {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    queue.push(payload);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage unavailable (private mode); the confirmation still points to the phone line.
  }
  await new Promise((r) => setTimeout(r, 700));
}
