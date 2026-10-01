import { brand, dealership, SITE_URL, factOr } from "@/lib/dealership-config";
import { brandImageSrc } from "@/lib/email/brand-images";

/**
 * Every email this product sends: a letter on the dealership's own
 * stationery.
 *
 * The shape brief (owner-confirmed, 29 Aug, revised 3 Sept for "more
 * luxurious, clean, smooth and opulent"): The Letterhead. The email is a
 * sheet of the same paper the documents print on. The marks sit centred at
 * the head of the sheet the way they do on the bill of sale's letterhead,
 * over one hairline. The heading is set in the documents' serif, the body
 * in the desk's grotesque at a reading measure, with air around both. One
 * copper element on the whole sheet: a short rule under the heading, the
 * same mark the documents use. Everything else is ink and paper, so it
 * survives a copier, a dark-mode inbox and a client that strips webfonts.
 *
 * Gmail strips the webfont link and the serif falls back to Georgia, the
 * grotesque to Helvetica Neue: both keep the voice. Apple Mail loads the
 * real faces.
 *
 * No template ever interpolates a password. Credentials travel as
 * one-time links or codes that expire, or not at all.
 */

export type EmailContent = { subject: string; html: string; text: string };
type Language = "en" | "es";

const INK = "#0c0c0d";
const BODY_INK = "#1c1c1a";
const PAPER = "#f3efe7";
const SHEET = "#ffffff";
const LINE = "#d9d5cc";
const MUTED = "#4a4a45";
const COPPER = "#8a4f2b";
const SERIF = "'Cormorant Garamond','Garamond','Georgia','Times New Roman',serif";
const STACK = "'Geist','Helvetica Neue',Helvetica,Arial,sans-serif";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * The sheet.
 *
 * A letter, not a card: white paper edge to edge inside a hairline, square
 * corners, wide margins. The marks are hosted on the site so every client
 * can fetch them; alt text carries the name for clients that block images,
 * and fixed dimensions keep a blocked image from collapsing the letterhead.
 *
 * `preheader` is the line an inbox shows beside the subject. Without one,
 * Gmail shows the first words of the body, which for a code email would be
 * the greeting rather than the point.
 */
type LayoutOptions = {
  /**
   * `full` is the letterhead footer: legal name, address, phone, licence, and
   * where to write. `mark` is the monogram alone, linked to the site, for a
   * letter the owner wants to read as four lines and a button (7 Sept).
   */
  footer?: "full" | "mark";
};

function layout(heading: string, bodyHtml: string, language: Language, preheader = "", options: LayoutOptions = {}): string {
  const questions =
    language === "es"
      ? `¿Preguntas? Responda a este correo o escriba a <a href="mailto:${brand.supportReplyTo}" style="color:${INK};text-decoration:none;border-bottom:1px solid ${LINE};">${brand.supportReplyTo}</a>.`
      : `Questions? Reply to this email or write to <a href="mailto:${brand.supportReplyTo}" style="color:${INK};text-decoration:none;border-bottom:1px solid ${LINE};">${brand.supportReplyTo}</a>.`;
  const licence =
    language === "es"
      ? `Concesionario con licencia de Texas ${escapeHtml(factOr(dealership.license, "dealer licence (GDN)"))}`
      : `Texas licensed dealer ${escapeHtml(factOr(dealership.license, "dealer licence (GDN)"))}`;
  const monogram = `<img src="${brandImageSrc("tj-monogram")}" width="36" height="55" alt="" style="display:block;width:36px;height:55px;margin:0 auto;">`;
  const wordmarkImg = `<img src="${brandImageSrc("tj-wordmark")}" width="196" height="48" alt="${escapeHtml(brand.full)}" style="display:block;width:196px;height:48px;margin:14px auto 0;">`;
  const footer =
    options.footer === "mark"
      ? `<tr><td align="center" style="border-top:1px solid ${LINE};padding-top:30px;">
            <a href="${SITE_URL}" style="display:inline-block;text-decoration:none;" aria-label="${escapeHtml(brand.full)}"><img src="${brandImageSrc("tj-monogram")}" width="28" height="43" alt="${escapeHtml(brand.full)}" style="display:block;width:28px;height:43px;"></a>
          </td></tr>`
      : `<tr><td align="center" style="border-top:1px solid ${LINE};padding-top:24px;text-align:center;">
            <div style="font-family:${STACK};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${INK};padding-bottom:8px;">${escapeHtml(factOr(dealership.legalName, "dealer legal name"))}</div>
            <div style="font-family:${STACK};font-size:12.5px;line-height:1.8;color:${MUTED};">
              ${escapeHtml(dealership.address.street)}, ${escapeHtml(dealership.address.locality)}, ${escapeHtml(dealership.address.region)} ${escapeHtml(dealership.address.postalCode)}<br>
              ${dealership.phone.display} &middot; ${licence}<br>
              ${questions}
            </div>
            <a href="${SITE_URL}" style="display:inline-block;text-decoration:none;margin-top:24px;" aria-label="${escapeHtml(brand.full)}"><img src="${brandImageSrc("tj-monogram")}" width="28" height="43" alt="" style="display:block;width:28px;height:43px;"></a>
          </td></tr>`;
  return `<!doctype html>
<html lang="${language}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${PAPER};opacity:0;">${escapeHtml(preheader)}${"&nbsp;&zwnj;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
  <tr><td align="center" style="padding:48px 16px 64px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:${SHEET};border:1px solid ${LINE};">
      <tr><td style="padding:52px 52px 0;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding-bottom:30px;">
            ${monogram}
            ${wordmarkImg}
          </td></tr>
          <tr><td style="border-top:1px solid ${LINE};font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>

        <div style="font-family:${SERIF};font-size:34px;font-weight:500;letter-spacing:-0.005em;line-height:1.18;color:${INK};padding:38px 0 0;text-align:center;">${escapeHtml(heading)}</div>
        <div style="width:40px;height:1px;background:${COPPER};margin:18px auto 26px;font-size:0;line-height:0;">&nbsp;</div>

        <div style="font-family:${STACK};font-size:15.5px;line-height:1.75;color:${BODY_INK};max-width:54ch;margin:0 auto;text-align:center;">
          ${bodyHtml}
        </div>

      </td></tr>
      <tr><td style="padding:44px 52px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${footer}
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** The one action, in the app's own voice: ink fill, Title Case, 10px radius. */
function action(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 6px;"><tr>
    <td style="background:${INK};border-radius:10px;">
      <a href="${href}" style="display:inline-block;font-family:${STACK};font-size:15px;font-weight:600;color:${SHEET};text-decoration:none;padding:15px 30px;letter-spacing:0.005em;">${escapeHtml(label)}</a>
    </td>
  </tr></table>`;
}

/**
 * A one-time code, set the way a figure is set on the bill of sale: large,
 * spaced, inside a hairline, nothing else near it. Tabular figures so the
 * six digits sit in a row a person can read back over the phone.
 */
function codeBlock(code: string, caption: string): string {
  const spaced = code.length === 6 ? `${code.slice(0, 3)}&#8202;&#8202;${code.slice(3)}` : escapeHtml(code);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 8px;"><tr>
    <td style="border:1px solid ${LINE};padding:22px 34px;">
      <div style="font-family:${STACK};font-size:36px;font-weight:600;letter-spacing:0.26em;line-height:1;color:${INK};font-variant-numeric:tabular-nums;white-space:nowrap;">${spaced}</div>
    </td>
  </tr></table>
  <p style="margin:0 0 14px;font-family:${STACK};font-size:13px;line-height:1.7;color:${MUTED};">${escapeHtml(caption)}</p>`;
}

const P = `style="margin:0 0 14px;"`;
const FINE = `style="margin:18px 0 0;font-size:13px;line-height:1.7;color:${MUTED};"`;

// ---------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------
export function passwordResetEmail(language: Language, recoverUrl: string): EmailContent {
  if (language === "es") {
    return {
      subject: `Restablecer su contraseña de ${brand.short}`,
      html: layout(
        "Elija Una Contraseña Nueva",
        `<p ${P}>Alguien pidió restablecer la contraseña de esta cuenta. Si fue usted, el botón lo lleva a elegir una nueva. El enlace funciona una sola vez y caduca pronto.</p>
         ${action(recoverUrl, "Elegir Una Contraseña Nueva")}
         <p ${FINE}>Si no fue usted, no haga nada. Su contraseña no cambia hasta que se elija una nueva.</p>`,
        language,
        "El enlace para elegir una contraseña nueva. Funciona una sola vez.",
      ),
      text: `Alguien pidió restablecer la contraseña de esta cuenta. Si fue usted, abra este enlace (funciona una sola vez y caduca pronto):\n\n${recoverUrl}\n\nSi no fue usted, no haga nada. Su contraseña no cambia hasta que se elija una nueva.`,
    };
  }
  return {
    subject: `Reset your ${brand.short} password`,
    html: layout(
      "Choose A New Password",
      `<p ${P}>Somebody asked to reset this account's password. If that was you, the button takes you to choose a new one. The link works once and expires soon.</p>
       ${action(recoverUrl, "Choose A New Password")}
       <p ${FINE}>If that wasn't you, do nothing. Your password does not change until a new one is chosen.</p>`,
      language,
      "Your link to choose a new password. It works once.",
    ),
    text: `Somebody asked to reset this account's password. If that was you, open this link (it works once and expires soon):\n\n${recoverUrl}\n\nIf that wasn't you, do nothing. Your password does not change until a new one is chosen.`,
  };
}

// ---------------------------------------------------------------------
// Team welcome / approval: a one-time link, never a password
// ---------------------------------------------------------------------
export function teamWelcomeEmail(
  language: Language,
  fullName: string,
  roleLabel: string,
  inviteUrl: string,
): EmailContent {
  const name = fullName.trim().split(/\s+/)[0] || fullName;
  if (language === "es") {
    return {
      subject: `Ya tiene acceso al portal de ${brand.short}`,
      html: layout(
        "Bienvenido Al Equipo",
        `<p ${P}>Hola ${escapeHtml(name)},</p>
         <p ${P}>Su cuenta del portal de ${escapeHtml(brand.short)} está aprobada, con el rol de <strong>${escapeHtml(roleLabel)}</strong>.</p>
         <p ${P}>El botón lo lleva a elegir su contraseña y entrar. El enlace funciona una sola vez. Al entrar, el escritorio le muestra dónde está cada cosa y le pide su firma, que irá en cada documento que usted presente.</p>
         ${action(inviteUrl, "Elegir Mi Contraseña")}`,
        language,
        `Su cuenta está aprobada con el rol de ${roleLabel}.`,
      ),
      text: `Hola ${name},\n\nSu cuenta del portal de ${brand.short} está aprobada, con el rol de ${roleLabel}.\n\nElija su contraseña aquí (el enlace funciona una sola vez):\n${inviteUrl}`,
    };
  }
  return {
    subject: `You're in: ${brand.short} portal access`,
    html: layout(
      "Welcome To The Team",
      `<p ${P}>Hi ${escapeHtml(name)},</p>
       <p ${P}>Your ${escapeHtml(brand.short)} portal account is approved, with the <strong>${escapeHtml(roleLabel)}</strong> role.</p>
       <p ${P}>The button takes you to choose your password and sign in. The link works once. When you are in, the desk shows you where everything is and asks for your signature, which goes on every document you file.</p>
       ${action(inviteUrl, "Choose My Password")}`,
      language,
      `Your account is approved with the ${roleLabel} role.`,
    ),
    text: `Hi ${name},\n\nYour ${brand.short} portal account is approved, with the ${roleLabel} role.\n\nChoose your password here (the link works once):\n${inviteUrl}`,
  };
}

// ---------------------------------------------------------------------
// One-time codes: signing in, and proving an address on an access request
// ---------------------------------------------------------------------
export function signInCodeEmail(language: Language, code: string, minutes: number): EmailContent {
  if (language === "es") {
    return {
      subject: `Su código para entrar a ${brand.short}`,
      html: layout(
        "Su Código Para Entrar",
        `<p ${P}>Escriba este código en la pantalla de entrada. Funciona durante ${minutes} minutos y una sola vez.</p>
         ${codeBlock(code, `Caduca en ${minutes} minutos.`)}
         <p ${FINE}>Si usted no pidió entrar, no haga nada: nadie puede usar el código sin este correo.</p>`,
        language,
        "Su código para entrar, válido diez minutos.",
      ),
      text: `Su código para entrar a ${brand.short}: ${code}\n\nFunciona durante ${minutes} minutos y una sola vez. Si usted no pidió entrar, no haga nada.`,
    };
  }
  return {
    subject: `Your ${brand.short} sign-in code`,
    html: layout(
      "Your Sign-In Code",
      `<p ${P}>Type this code on the sign-in screen. It works for ${minutes} minutes and once.</p>
       ${codeBlock(code, `Expires in ${minutes} minutes.`)}
       <p ${FINE}>If you did not ask to sign in, do nothing: nobody can use the code without this email.</p>`,
      language,
      "Your sign-in code, good for ten minutes.",
    ),
    text: `Your ${brand.short} sign-in code: ${code}\n\nIt works for ${minutes} minutes and once. If you did not ask to sign in, do nothing.`,
  };
}

export function verifyEmailCodeEmail(language: Language, code: string, minutes: number): EmailContent {
  if (language === "es") {
    return {
      subject: `Confirme su correo para ${brand.short}`,
      html: layout(
        "Confirme Que Este Correo Es Suyo",
        `<p ${P}>Alguien está pidiendo acceso al portal de ${escapeHtml(brand.short)} con esta dirección. Escriba este código en la solicitud para confirmar que es suya.</p>
         ${codeBlock(code, `Caduca en ${minutes} minutos.`)}
         <p ${FINE}>Si no fue usted, ignore este correo. Sin el código, la solicitud no se registra.</p>`,
        language,
        "El código para confirmar su dirección.",
      ),
      text: `Su código para confirmar este correo con ${brand.short}: ${code}\n\nCaduca en ${minutes} minutos. Si no fue usted, ignore este correo.`,
    };
  }
  return {
    subject: `Confirm your email for ${brand.short}`,
    html: layout(
      "Confirm This Email Is Yours",
      `<p ${P}>Somebody is requesting access to the ${escapeHtml(brand.short)} portal with this address. Type this code into the request to confirm it is yours.</p>
       ${codeBlock(code, `Expires in ${minutes} minutes.`)}
       <p ${FINE}>If that was not you, ignore this email. Without the code, the request is never recorded.</p>`,
      language,
      "The code to confirm your address.",
    ),
    text: `Your code to confirm this email with ${brand.short}: ${code}\n\nIt expires in ${minutes} minutes. If that was not you, ignore this email.`,
  };
}

// ---------------------------------------------------------------------
// Customer welcome, after a completed sale
// ---------------------------------------------------------------------
export function customerWelcomeEmail(
  language: Language,
  buyerName: string,
  vehicle: string,
): EmailContent {
  const name = buyerName.trim().split(/\s+/)[0] || buyerName;
  if (language === "es") {
    return {
      subject: `Su ${vehicle}, gracias de ${brand.short}`,
      html: layout(
        `Su ${vehicle}`,
        `<p ${P}>Hola ${escapeHtml(name)},</p>
         <p ${P}>Gracias por comprar con nosotros.</p>
         <p ${P}>Qué sigue: nosotros presentamos el título y el registro. Cuando lleguen las placas, le avisamos. Guarde sus papeles firmados; si necesita otra copia, pídala cuando quiera.</p>
         <p style="margin:0;">Si algo del carro le preocupa esta semana, escríbanos o llame. Es más rápido que adivinar.</p>`,
        language,
        "Gracias por comprar con nosotros. Qué sigue con su título y placas.",
      ),
      text: `Hola ${name},\n\nGracias por comprar su ${vehicle} con nosotros.\n\nQué sigue: nosotros presentamos el título y el registro. Cuando lleguen las placas, le avisamos. Guarde sus papeles firmados; si necesita otra copia, pídala cuando quiera.\n\nSi algo del carro le preocupa esta semana, escríbanos a ${brand.supportReplyTo} o llame al ${dealership.phone.display}.`,
    };
  }
  return {
    subject: `Your ${vehicle}, thank you from ${brand.short}`,
    html: layout(
      `Your ${vehicle}`,
      `<p ${P}>Hi ${escapeHtml(name)},</p>
       <p ${P}>Thank you for buying from us.</p>
       <p ${P}>What happens next: we file the title and registration. When the plates arrive, we let you know. Keep your signed paperwork; if you ever need another copy, just ask.</p>
       <p style="margin:0;">If anything about the car worries you this week, email or call. It beats guessing.</p>`,
      language,
      "Thank you for buying from us. What happens next with your title and plates.",
    ),
    text: `Hi ${name},\n\nThank you for buying your ${vehicle} from us.\n\nWhat happens next: we file the title and registration. When the plates arrive, we let you know. Keep your signed paperwork; if you ever need another copy, just ask.\n\nIf anything about the car worries you this week, email ${brand.supportReplyTo} or call ${dealership.phone.display}.`,
  };
}

// ---------------------------------------------------------------------
// Pre-approval invitation: the desk sends a client their personal link
// ---------------------------------------------------------------------

/**
 * The invitation is the one letter a client reads before they have met us,
 * so it says exactly what will happen and asks for nothing. The link opens
 * our own financing page, greeted by name, and only then hands them to the
 * lender's secure application. No SSN, income or address is ever asked for
 * in mail.
 */
export function creditInviteEmail(
  language: Language,
  input: { name: string; vehicle: string | null; url: string; lender: string },
): EmailContent {
  const name = input.name.trim().split(/\s+/)[0] || input.name;
  const vehicle = input.vehicle?.trim() || null;
  if (language === "es") {
    const about = vehicle ? ` para su ${escapeHtml(vehicle)}` : "";
    const aboutText = vehicle ? ` para su ${vehicle}` : "";
    return {
      subject: `Su preaprobación con ${brand.short}`,
      html: layout(
        "Su preaprobación, lista para comenzar",
        `<p ${P}>Hola ${escapeHtml(name)},</p>
         <p ${P}>Preparamos su solicitud de preaprobación${about}. Toma unos minutos y la puede hacer desde su teléfono antes de visitarnos, para que el papeleo esté listo cuando llegue.</p>
         <p ${P}>Así funciona: su enlace abre en nuestro sitio, ya con sus datos. Desde ahí pasa a la solicitud segura de ${escapeHtml(input.lender)}, nuestro socio prestamista, que considera todo tipo de crédito.</p>
         <p ${P}>Tenga a la mano su dirección, sus ingresos y su número de Seguro Social o ITIN. Nunca los pediremos por correo.</p>
         ${action(input.url, "Comenzar Mi Preaprobación")}
         <p ${FINE}>Si el botón no abre, copie este enlace en su navegador:<br><a href="${input.url}" style="color:${MUTED};word-break:break-all;">${escapeHtml(input.url)}</a></p>
         <p ${FINE}>Una solicitud no garantiza la aprobación, pero recibirá una respuesta rápida. Si prefiere hablar primero, llame al ${dealership.phone.display}.</p>`,
        language,
        `Su enlace personal de preaprobación${aboutText}. Unos minutos desde su teléfono.`,
      ),
      text: `Hola ${name},\n\nPreparamos su solicitud de preaprobación${aboutText}. Toma unos minutos y la puede hacer desde su teléfono antes de visitarnos.\n\nSu enlace abre en nuestro sitio, ya con sus datos, y de ahí pasa a la solicitud segura de ${input.lender}, nuestro socio prestamista.\n\nTenga a la mano su dirección, sus ingresos y su número de Seguro Social o ITIN. Nunca los pediremos por correo.\n\nComenzar: ${input.url}\n\nUna solicitud no garantiza la aprobación, pero recibirá una respuesta rápida. Si prefiere hablar primero, llame al ${dealership.phone.display}.`,
    };
  }
  const about = vehicle ? ` for your ${escapeHtml(vehicle)}` : "";
  const aboutText = vehicle ? ` for your ${vehicle}` : "";
  return {
    subject: `Your pre-approval with ${brand.short}`,
    html: layout(
      "Your pre-approval, ready to start",
      `<p ${P}>Hi ${escapeHtml(name)},</p>
       <p ${P}>We have prepared your pre-approval application${about}. It takes a few minutes and you can do it from your phone before you visit, so the paperwork is waiting when you arrive.</p>
       <p ${P}>Here is how it works: your link opens on our site with your details already in place. From there you go on to the secure application with ${escapeHtml(input.lender)}, our lending partner, who considers every credit situation.</p>
       <p ${P}>Have your address, your income and your Social Security number or ITIN ready. We will never ask for those by email.</p>
       ${action(input.url, "Start My Pre-Approval")}
       <p ${FINE}>If the button does not open, copy this link into your browser:<br><a href="${input.url}" style="color:${MUTED};word-break:break-all;">${escapeHtml(input.url)}</a></p>
       <p ${FINE}>An application is not a guarantee of approval, but you will get a fast answer. If you would rather talk first, call ${dealership.phone.display}.</p>`,
      language,
      `Your personal pre-approval link${aboutText}. A few minutes from your phone.`,
    ),
    text: `Hi ${name},\n\nWe have prepared your pre-approval application${aboutText}. It takes a few minutes and you can do it from your phone before you visit.\n\nYour link opens on our site with your details already in place, and from there you go on to the secure application with ${input.lender}, our lending partner.\n\nHave your address, your income and your Social Security number or ITIN ready. We will never ask for those by email.\n\nStart here: ${input.url}\n\nAn application is not a guarantee of approval, but you will get a fast answer. If you would rather talk first, call ${dealership.phone.display}.`,
  };
}

// ---------------------------------------------------------------------
// Lender handoff: the client chose a lender on /financing, here is the link
// ---------------------------------------------------------------------

/**
 * Sent the moment a client picks their lender on the financing page, with no
 * one at the desk in the loop. It carries the one thing they need, the link
 * to that lender's own application, and tells them what to have ready so the
 * Social Security number and documents are entered there and nowhere else.
 */
export function lenderHandoffEmail(
  language: Language,
  input: {
    name: string;
    /** `site` is the lender's own front door, which the name links to. */
    lender: { name: string; site: string; tagline: string };
    /** The bridge to the lender's application, absolute. */
    url: string;
    vehicle: string | null;
  },
): EmailContent {
  const name = input.name.trim().split(/\s+/)[0] || input.name;
  const vehicle = input.vehicle?.trim() || null;
  const lenderName = escapeHtml(input.lender.name);
  const lender = `<a href="${input.lender.site}" style="color:${INK};text-decoration:none;border-bottom:1px solid ${LINE};">${lenderName}</a>`;
  const fallback = (lead: string) =>
    `<p ${FINE}>${lead}<br><a href="${input.url}" style="color:${MUTED};word-break:break-all;">${escapeHtml(input.url)}</a></p>`;
  if (language === "es") {
    const about = vehicle ? ` para su ${escapeHtml(vehicle)}` : "";
    const aboutText = vehicle ? ` para su ${vehicle}` : "";
    const heading = `Su Preaprobación Con ${input.lender.name}`;
    return {
      subject: heading,
      html: layout(
        heading,
        `<p ${P}>Hola ${escapeHtml(name)},</p>
         <p ${P}>Eligió a ${lender}${about}. ${escapeHtml(input.lender.tagline)}</p>
         <p ${P}>Su solicitud se completa en el sitio seguro de ${lenderName}.</p>
         ${action(input.url, `Comenzar Con ${input.lender.name}`)}
         ${fallback("Si el botón no abre, copie este enlace en su navegador:")}`,
        language,
        `Su enlace de preaprobación con ${input.lender.name}${aboutText}.`,
        { footer: "mark" },
      ),
      text: `Hola ${name},\n\nEligió a ${input.lender.name}${aboutText}. ${input.lender.tagline}\n\nSu solicitud se completa en el sitio seguro de ${input.lender.name}.\n\nComenzar: ${input.url}\n\n${SITE_URL}`,
    };
  }
  const about = vehicle ? ` for your ${escapeHtml(vehicle)}` : "";
  const aboutText = vehicle ? ` for your ${vehicle}` : "";
  const heading = `Your Pre-Approval With ${input.lender.name}`;
  return {
    subject: heading,
    html: layout(
      // A non-breaking hyphen so a phone never breaks the line at "Pre-".
      heading.replace("Pre-Approval", "Pre\u2011Approval"),
      `<p ${P}>Hi ${escapeHtml(name)},</p>
       <p ${P}>You chose ${lender}${about}. ${escapeHtml(input.lender.tagline)}</p>
       <p ${P}>Your application is completed on ${lenderName}'s secure site.</p>
       ${action(input.url, `Start With ${input.lender.name}`)}
       ${fallback("If the button does not open, copy this link into your browser:")}`,
      language,
      `Your pre-approval link with ${input.lender.name}${aboutText}.`,
      { footer: "mark" },
    ),
    text: `Hi ${name},\n\nYou chose ${input.lender.name}${aboutText}. ${input.lender.tagline}\n\nYour application is completed on ${input.lender.name}'s secure site.\n\nStart here: ${input.url}\n\n${SITE_URL}`,
  };
}

// ---------------------------------------------------------------------
// Owner alert: needs-your-eyes events, always English (the owner's mail)
// ---------------------------------------------------------------------
export function ownerAlertEmail(title: string, lines: string[], actionUrl?: string): EmailContent {
  const safeLines = lines.map((line) => `<p style="margin:0 0 10px;">${escapeHtml(line)}</p>`).join("");
  return {
    subject: `${brand.short}: ${title}`,
    html: layout(
      title,
      `${safeLines}
       ${actionUrl ? action(actionUrl, "Open It") : ""}`,
      "en",
      lines[0] ?? title,
    ),
    text: `${title}\n\n${lines.join("\n")}${actionUrl ? `\n\n${actionUrl}` : ""}`,
  };
}

// ---------------------------------------------------------------------
// Document delivery: the finalize/resend mail, on the letterhead
// ---------------------------------------------------------------------
export function documentDeliveryEmail(
  language: Language,
  buyerName: string,
  documentTitle: string,
  portalUrl: string | null,
): EmailContent {
  const name = buyerName.trim().split(/\s+/)[0] || buyerName;
  if (language === "es") {
    return {
      subject: `Su documento de ${brand.short}: ${documentTitle}`,
      html: layout(
        documentTitle,
        `<p ${P}>Hola ${escapeHtml(name)},</p>
         <p ${P}>Su documento está listo. ${portalUrl ? "El botón lo abre. Solo usted tiene este enlace." : "Va adjunto a este correo."}</p>
         ${portalUrl ? action(portalUrl, "Abrir Mi Documento") : ""}`,
        language,
        `Su ${documentTitle} está listo.`,
      ),
      text: `Hola ${name},\n\nSu ${documentTitle} está listo.${portalUrl ? ` Ábralo aquí (solo usted tiene este enlace):\n${portalUrl}` : " Va adjunto a este correo."}`,
    };
  }
  return {
    subject: `Your ${brand.short} document: ${documentTitle}`,
    html: layout(
      documentTitle,
      `<p ${P}>Hi ${escapeHtml(name)},</p>
       <p ${P}>Your document is ready. ${portalUrl ? "The button opens it. Only you have this link." : "It is attached to this email."}</p>
       ${portalUrl ? action(portalUrl, "Open My Document") : ""}`,
      language,
      `Your ${documentTitle} is ready.`,
    ),
    text: `Hi ${name},\n\nYour ${documentTitle} is ready.${portalUrl ? ` Open it here (only you have this link):\n${portalUrl}` : " It is attached to this email."}`,
  };
}

// ---------------------------------------------------------------------
// An offer, accepted
// ---------------------------------------------------------------------

/**
 * The terms of a role, as the person accepting it needs to read them.
 *
 * Every field is required and none has a default. An offer letter states what
 * somebody is being paid, when they start, and who they answer to — a template
 * that could fall back to a placeholder would eventually send one, and a wrong
 * number in an employment document is a wrong number the recipient relies on.
 * The caller supplies all of it or the letter does not exist.
 *
 * Where the work happens and who they answer to were on this letter and came
 * off it (owner's call): a small lot settles both in person on the first
 * morning, and a line stating them adds nothing a new hire did not already
 * know from the conversation that got them here.
 */
export type OfferTerms = {
  /** As it should appear on the paperwork, not a nickname. */
  fullName: string;
  /**
   * What to call them in the greeting.
   *
   * Explicit, never derived. This used to take the first word of `fullName`,
   * which assumes the given name comes first — and for "Ogundeji, Adeola" that
   * greets a new hire with his surname and a stray comma, on the first
   * document he ever receives from us. Name order is not a thing to infer from
   * a string, so the caller says it.
   */
  greetAs: string;
  /** The title, as the org chart carries it. */
  role: string;
  /** W-2 employee, contractor, part-time, and so on. */
  employmentType: string;
  /** Written the way a person says a date: "Monday, 22 September 2026". */
  startDate: string;
  /** The whole figure and its period: "$52,000 per year", "$28 per hour". */
  compensation: string;
  /** Hours and days, in plain words. */
  schedule: string;
  /** What they do first, in order. Each one a short imperative line. */
  firstSteps: string[];
  /** Who signs the letter off, by name and title. */
  signedBy: { name: string; title: string };
};

/**
 * The offer, confirmed in writing.
 *
 * Warmer than the other letters, because it is the one email a person keeps.
 * It still obeys the sheet: one copper rule under the heading and nothing else
 * coloured, so the terms read as terms rather than as marketing.
 *
 * The terms sit in a bordered block rather than a paragraph. Somebody reading
 * this will come back to it to check a date or a figure, and a table is what
 * you scan; prose is what you read once. The same reason the bill of sale sets
 * its figures apart.
 *
 * English only. This is a letter to one named person, and the language it is
 * written in is a thing the sender knows, not a thing a template should guess.
 */
export function offerAcceptanceEmail(terms: OfferTerms): EmailContent {
  const first = terms.greetAs.trim() || terms.fullName;

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:11px 0;border-bottom:1px solid ${LINE};font-family:${STACK};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};white-space:nowrap;vertical-align:top;text-align:left;">${escapeHtml(label)}</td>
      <td style="padding:11px 0 11px 24px;border-bottom:1px solid ${LINE};font-family:${STACK};font-size:15px;line-height:1.6;color:${INK};text-align:left;">${escapeHtml(value)}</td>
    </tr>`;

  /*
    The name is a term, and the first one.

    It was collected on the form, required by the type, and printed nowhere —
    the letter greeted a first name and then stated a role, a date and a
    figure without ever saying whose they were. An offer names the person it
    is addressed to, written the way their paperwork writes it, which is not
    always the way you would greet them.
  */
  const termsTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;border-top:1px solid ${LINE};">
      ${row("Name", terms.fullName)}
      ${row("Role", terms.role)}
      ${row("Type", terms.employmentType)}
      ${row("Start", terms.startDate)}
      ${row("Pay", terms.compensation)}
      ${row("Schedule", terms.schedule)}
    </table>`;

  const steps = terms.firstSteps
    .map(
      (step, i) =>
        `<tr>
          <td style="padding:9px 14px 9px 0;font-family:${STACK};font-size:15px;font-weight:600;color:${MUTED};vertical-align:top;text-align:left;width:1%;white-space:nowrap;">${i + 1}</td>
          <td style="padding:9px 0;font-family:${STACK};font-size:15px;line-height:1.65;color:${BODY_INK};text-align:left;">${escapeHtml(step)}</td>
        </tr>`,
    )
    .join("");

  const stepsTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0;">${steps}</table>`;

  const heading = `Welcome To ${brand.short}`;

  const html = layout(
    heading,
    `<p ${P}>${escapeHtml(first)},</p>
     <p ${P}>On behalf of everyone at ${escapeHtml(factOr(dealership.legalName, "dealer legal name"))}, it is our pleasure to confirm your offer as <strong>${escapeHtml(terms.role)}</strong>. We are glad you said yes.</p>
     <p ${P}>Here are the terms as we have them. If any line reads differently from what we discussed, reply to this email before your start date and we will put it right.</p>
     ${termsTable}
     <p style="margin:34px 0 0;font-family:${SERIF};font-size:19px;color:${INK};">What happens next</p>
     ${stepsTable}
     <p style="margin:30px 0 0;">Bring a government photo ID and your completed tax and eligibility paperwork on your first day. We will have everything else ready for you.</p>
     <p style="margin:22px 0 0;">Welcome aboard.</p>
     <p style="margin:22px 0 0;">${escapeHtml(terms.signedBy.name)}<br><span style="color:${MUTED};">${escapeHtml(terms.signedBy.title)}, ${escapeHtml(factOr(dealership.legalName, "dealer legal name"))}</span></p>`,
    "en",
    `Your offer as ${terms.role}, confirmed, and what happens next.`,
  );

  const textSteps = terms.firstSteps.map((step, i) => `${i + 1}. ${step}`).join("\n");

  return {
    subject: `Your Offer With ${brand.short}: ${terms.role}`,
    html,
    text: `${first},

On behalf of everyone at ${factOr(dealership.legalName, "dealer legal name")}, it is our pleasure to confirm your offer as ${terms.role}. We are glad you said yes.

Here are the terms as we have them. If any line reads differently from what we discussed, reply to this email before your start date and we will put it right.

Name        ${terms.fullName}
Role        ${terms.role}
Type        ${terms.employmentType}
Start       ${terms.startDate}
Pay         ${terms.compensation}
Schedule    ${terms.schedule}

WHAT HAPPENS NEXT
${textSteps}

Bring a government photo ID and your completed tax and eligibility paperwork on your first day. We will have everything else ready for you.

Welcome aboard.

${terms.signedBy.name}
${terms.signedBy.title}, ${factOr(dealership.legalName, "dealer legal name")}

${SITE_URL}`,
  };
}

/** The one canonical recovery landing, hard-coded, never request-derived. */
export function recoveryUrlFor(hashedToken: string): string {
  return `${SITE_URL}/admin/recover#token=${encodeURIComponent(hashedToken)}`;
}
