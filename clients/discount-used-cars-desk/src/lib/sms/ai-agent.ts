/**
 * AI SMS Agent — Claude-powered contextual replies and payment reminders.
 *
 * INBOUND FLOW (Haiku — fast, cheap, 3s timeout):
 *   Customer texts → webhook identifies customer → load context
 *   → generateAIReply(context, message) → send via provider.ts
 *
 * REMINDER FLOW (Sonnet — higher quality, 5s timeout):
 *   Admin manual send with auto:true → load context
 *   → generateReminder(context) → send via provider.ts
 *
 * FALLBACK: If Claude API is unavailable, times out, or ANTHROPIC_API_KEY
 * is missing, returns a generic template reply directing customer to call.
 */

import type { Customer, PaymentSchedule, Installment, SmsMessage } from "@/types/database";
import { brand, dealership, factOr } from "@/lib/dealership-config";

const BUSINESS_PHONE = dealership.phone.display;
const BUSINESS_NAME = `${dealership.shortName} Auto`;

const FALLBACK_REPLY_EN =
  `Thanks for your message! Please call ${BUSINESS_PHONE} for assistance. - ${BUSINESS_NAME}`;
const FALLBACK_REPLY_ES =
  `Gracias por tu mensaje! Llama al ${BUSINESS_PHONE} para asistencia. - ${BUSINESS_NAME}`;

export interface SmsContext {
  customer: Customer;
  activeSchedule: PaymentSchedule | null;
  nextInstallment: Installment | null;
  recentMessages: SmsMessage[];
}

/**
 * SYSTEM PROMPT, built from `dealership.profile`
 *
 * Engineered for BHPH dealership SMS: bilingual, warm but direct,
 * never threatens, escalates to phone for disputes/legal/hostile.
 * NEVER fabricates payment data — only references provided context.
 */
const SYSTEM_PROMPT = `You are the AI assistant for ${factOr(dealership.legalName, "dealer legal name")}, a vehicle dealership in ${dealership.profile.locale}. You communicate with customers via SMS on behalf of ${dealership.shortName}.

BUSINESS CONTEXT:
- ${dealership.shortName} sells and finances ${dealership.profile.segment}
- We offer ${dealership.profile.offers}
- Business phone: ${BUSINESS_PHONE}
- Location: ${dealership.address.oneLine}
- Owner: ${dealership.profile.owner}

YOUR ROLE:
- Send payment reminders and follow up on late payments
- Answer customer questions about their account, payment amounts, due dates
- Be professional, warm, but direct — these are working families
- If a customer has a hardship, acknowledge it but still move toward resolution
- Always include "Reply STOP to opt out" on the FIRST outbound message in a conversation

TONE:
- Professional but human. Not corporate robot language.
- Bilingual: if customer texts in Spanish, respond in Spanish.
- Short and clear — this is SMS, not email. Keep under 300 characters when possible.
- Never threaten. Never use aggressive collections language.
- Frame everything around partnership: "Let's get this handled together"
- Do not use emojis

ESCALATION RULES:
- Legal action mentioned → "We understand your concern. Please contact us directly at ${BUSINESS_PHONE} so we can work with you personally."
- Hostile/threatening → respond calmly, offer to speak by phone
- Repo questions → "Please call us at ${BUSINESS_PHONE} to discuss your options. We want to help you keep your vehicle."
- STOP/UNSUBSCRIBE → "You've been unsubscribed from ${BUSINESS_NAME} messages. Call ${BUSINESS_PHONE} if you need us."
- Disputes amount → "Let's get this straightened out. Please call ${BUSINESS_PHONE} and we'll review your account together."

PAYMENT REMINDER APPROACH:
- 3 days before: Friendly heads up
- Day of: Clear reminder with amount
- 1-3 days late: Gentle nudge
- 5+ days late: Firmer, emphasize importance of communication
- 10+ days late: Urgent, mention need to speak by phone

CRITICAL: NEVER fabricate payment amounts, due dates, or vehicle info. Only reference data explicitly provided in the context below.`;

function buildContextBlock(ctx: SmsContext): string {
  const lines: string[] = [
    `CUSTOMER: ${ctx.customer.name}`,
    `PHONE: ${ctx.customer.phone}`,
    `LANGUAGE: ${ctx.customer.language === "es" ? "Spanish" : "English"}`,
  ];

  if (ctx.activeSchedule) {
    lines.push(`VEHICLE: ${ctx.activeSchedule.vehicleDescription}`);
    lines.push(`AGREEMENT: ${ctx.activeSchedule.scheduleType} — $${ctx.activeSchedule.installmentAmount} ${ctx.activeSchedule.frequency}`);
  }

  if (ctx.nextInstallment) {
    const remaining = ctx.nextInstallment.amountDue - ctx.nextInstallment.amountPaid;
    lines.push(`NEXT PAYMENT: $${remaining.toFixed(2)} due ${ctx.nextInstallment.dueDate}${ctx.nextInstallment.status === "upcoming" ? "" : ` (status: ${ctx.nextInstallment.status})`}`);
  }

  if (ctx.recentMessages.length > 0) {
    lines.push("", "RECENT CONVERSATION:");
    for (const msg of ctx.recentMessages.slice().reverse()) {
      const who =
    msg.direction === "inbound" ? "CUSTOMER" : brand.short.toUpperCase();
      lines.push(`[${who}] ${msg.body}`);
    }
  }

  return lines.join("\n");
}

function getDaysUntilDue(dueDate: string): number {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export async function generateAIReply(
  ctx: SmsContext,
  inboundMessage: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return ctx.customer.language === "es" ? FALLBACK_REPLY_ES : FALLBACK_REPLY_EN;
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const contextBlock = buildContextBlock(ctx);

    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `${contextBlock}\n\nINCOMING MESSAGE FROM CUSTOMER:\n"${inboundMessage}"\n\nGenerate the SMS reply. Keep it concise (under 320 chars if possible). Output ONLY the message text, nothing else.`,
          },
        ],
      },
      { signal: AbortSignal.timeout(3000) }
    );

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : null;

    if (!text) {
      return ctx.customer.language === "es" ? FALLBACK_REPLY_ES : FALLBACK_REPLY_EN;
    }

    // Truncate to 320 chars (2 SMS segments) if Claude goes long
    return text.length > 320 ? text.slice(0, 317) + "..." : text;
  } catch (err) {
    console.error("[ai-agent] Claude API error, using fallback:", err instanceof Error ? err.message : err);
    return ctx.customer.language === "es" ? FALLBACK_REPLY_ES : FALLBACK_REPLY_EN;
  }
}

/**
 * Generate an AI-powered payment reminder for proactive outbound SMS.
 * Uses Sonnet for higher quality tone in payment-sensitive messages.
 *
 * FLOW:
 *   SmsContext → extract payment info → classify urgency
 *   → Sonnet prompt → SMS text (under 320 chars)
 *   → fallback to template on any error
 */
export async function generateReminder(ctx: SmsContext): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Build fallback template
  const fallbackMessage = ctx.customer.language === "es"
    ? `Hola ${ctx.customer.name}! Recordatorio de pago de ${BUSINESS_NAME}.${ctx.nextInstallment ? ` $${(ctx.nextInstallment.amountDue - ctx.nextInstallment.amountPaid).toFixed(2)} vence el ${ctx.nextInstallment.dueDate}.` : ""} Llama al ${BUSINESS_PHONE} con preguntas.`
    : `Hi ${ctx.customer.name}! Payment reminder from ${BUSINESS_NAME}.${ctx.nextInstallment ? ` $${(ctx.nextInstallment.amountDue - ctx.nextInstallment.amountPaid).toFixed(2)} due ${ctx.nextInstallment.dueDate}.` : ""} Call ${BUSINESS_PHONE} with questions.`;

  if (!apiKey) {
    return fallbackMessage;
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    // Build urgency context from installment
    let urgencyInstruction = "Send a general check-in message.";
    if (ctx.nextInstallment) {
      const daysUntil = getDaysUntilDue(ctx.nextInstallment.dueDate);
      const remaining = ctx.nextInstallment.amountDue - ctx.nextInstallment.amountPaid;

      if (daysUntil > 1) {
        urgencyInstruction = `Payment of $${remaining.toFixed(2)} is due in ${daysUntil} days (${ctx.nextInstallment.dueDate}). Send a friendly heads-up.`;
      } else if (daysUntil === 0) {
        urgencyInstruction = `Payment of $${remaining.toFixed(2)} is due TODAY (${ctx.nextInstallment.dueDate}). Clear, direct reminder.`;
      } else {
        const daysLate = Math.abs(daysUntil);
        if (daysLate <= 3) {
          urgencyInstruction = `Payment of $${remaining.toFixed(2)} is ${daysLate} day(s) late. Gentle but clear nudge.`;
        } else if (daysLate <= 7) {
          urgencyInstruction = `Payment of $${remaining.toFixed(2)} is ${daysLate} days late. Firmer tone, emphasize communication.`;
        } else {
          urgencyInstruction = `Payment of $${remaining.toFixed(2)} is ${daysLate} days late. Urgent — they need to call us.`;
        }
      }
    }

    const contextBlock = buildContextBlock(ctx);

    const response = await client.messages.create(
      {
        // Was claude-sonnet-4-20250514, a retired id. A reminder path that
        // 404s falls through to the generic "please call us" template, so the
        // proactive reminder silently stopped being proactive.
        model: "claude-opus-5",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `${contextBlock}\n\nGENERATE A PROACTIVE PAYMENT REMINDER SMS.\nURGENCY: ${urgencyInstruction}\n\nOutput ONLY the SMS text. Under 320 characters. No quotation marks around the message.`,
          },
        ],
      },
      { signal: AbortSignal.timeout(5000) }
    );

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : null;

    if (!text) {
      return fallbackMessage;
    }

    return text.length > 320 ? text.slice(0, 317) + "..." : text;
  } catch (err) {
    console.error("[ai-agent] generateReminder error, using fallback:", err instanceof Error ? err.message : err);
    return fallbackMessage;
  }
}
