/** Only fixed public pages enter analytics. Query strings and customer routes never do. */
export function analyticsPage(pathname: string): { path: string; title: string } | null {
  const match = pathname.match(/^\/(en|es)(?:\/(inventory|about|contact|vin-decoder|privacy|terms|thank-you))?\/?$/);
  if (!match) return null;
  const titles: Record<string, string> = {
    home: "Home", inventory: "Inventory", about: "About", contact: "Contact",
    "vin-decoder": "VIN Decoder", privacy: "Privacy", terms: "Terms", "thank-you": "Inquiry Next Steps",
  };
  const route = match[2] || "home";
  return { path: `/${match[1]}${route === "home" ? "" : `/${route}`}`, title: titles[route] };
}

export function isAnalyticsId(value: string): boolean {
  return /^G-[A-Z0-9]{6,20}$/.test(value);
}

export const ANALYTICS_DENIED = {
  analytics_storage: "denied", ad_storage: "denied",
  ad_user_data: "denied", ad_personalization: "denied",
} as const;
