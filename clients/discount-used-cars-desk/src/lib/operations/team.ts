export const TEAM_ROLES = [
  "owner",
  "manager",
  "sales",
  "finance",
  "mechanic",
  "registration",
  "social",
  "lot",
  "viewer",
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_PERMISSIONS = [
  "admin:all",
  "admin:read",
  "team:manage",
  "tasks:manage",
  "tasks:work",
  "chat:use",
  "communications:read",
  "payments:read",
  "payments:manage",
  "rentals:read",
  "rentals:manage",
  "documents:read",
  "documents:manage",
  // Texting a buyer their finished paperwork. Its own scope — narrower than
  // documents:manage, held by the roles that actually close sales, so the
  // send is neither a manager-only errand nor an every-role default.
  "documents:deliver",
  // The sale corridor's own authority. Reading a deal (the list, a deal's
  // detail, the packet) and mutating one (starting, answering, closing)
  // were borrowed from documents:* for years, which meant the roles that
  // close sales and the roles that file titles could not be told apart.
  "sales:read",
  "sales:manage",
  "inventory:read",
  "inventory:manage",
  "leads:read",
  "leads:manage",
  "paperwork:read",
  "paperwork:manage",
  "social:manage",
  "vehicle_proof:create",
] as const;

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

export type TeamTaskCategory =
  | "marketplace"
  | "rentals"
  | "communications"
  | "paperwork"
  | "lot"
  | "social";

export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  manager: "Manager",
  sales: "Sales",
  finance: "Finance",
  mechanic: "Mechanic",
  registration: "Registration",
  social: "Social",
  lot: "Lot",
  viewer: "Viewer",
};

export const ROLE_SUMMARIES: Record<TeamRole, string> = {
  owner: "Everything. Money, documents, team, inventory, messages.",
  manager: "Runs the day with broad access but cannot replace owner authority.",
  sales: "Leads, customer follow-up, inventory visibility, and sales tasks.",
  finance: "Payment follow-up, balances, financing schedules, and money proof.",
  mechanic: "Vehicle condition, photos, prep, repair notes, and lot proof.",
  registration: "Paperwork, documents, title steps, plate notes, and DMV tasks.",
  social: "Content tasks, inventory visibility, customer-safe posts, and proof.",
  lot: "Vehicle movement, photos, keys, return checks, and lot tasks.",
  viewer: "Read-only training and visibility.",
};

export const ROLE_PERMISSIONS: Record<TeamRole, TeamPermission[]> = {
  owner: ["admin:all"],
  manager: [
    "admin:read",
    "team:manage",
    "tasks:manage",
    "tasks:work",
    "chat:use",
    "communications:read",
    "payments:read",
    "payments:manage",
    "rentals:read",
    "rentals:manage",
    "documents:read",
    "documents:manage",
    "documents:deliver",
    "sales:read",
    "sales:manage",
    "inventory:read",
    "inventory:manage",
    "leads:read",
    "leads:manage",
    "paperwork:read",
    "paperwork:manage",
    "social:manage",
    "vehicle_proof:create",
  ],
  sales: [
    "admin:read",
    "tasks:work",
    "chat:use",
    "communications:read",
    "rentals:read",
    "documents:read",
    "documents:deliver",
    // Selling is this role's job: the corridor, start to close. NOT
    // paperwork:manage — that scope also authorizes rental/title mutations
    // that are not this role's (Codex round 4, finding 3).
    "sales:read",
    "sales:manage",
    "inventory:read",
    "leads:read",
    "leads:manage",
  ],
  finance: [
    "admin:read",
    "tasks:work",
    "chat:use",
    "communications:read",
    "payments:read",
    "documents:read",
    // Money follow-up needs to OPEN a deal and its packet; it does not
    // need to mutate one.
    "sales:read",
    "rentals:read",
  ],
  mechanic: [
    "admin:read",
    "tasks:work",
    "chat:use",
    "inventory:read",
    "vehicle_proof:create",
  ],
  registration: [
    "admin:read",
    "tasks:work",
    "chat:use",
    "communications:read",
    "documents:read",
    "inventory:read",
    "rentals:read",
    "paperwork:read",
    "paperwork:manage",
    // Title work happens on the deal's screens: registration opens deals
    // and packets read-only, and reaches the document corridor through
    // its own paperwork:manage.
    "sales:read",
    "vehicle_proof:create",
  ],
  social: [
    "admin:read",
    "tasks:work",
    "chat:use",
    "inventory:read",
    "leads:read",
    "social:manage",
  ],
  lot: [
    "admin:read",
    "tasks:work",
    "chat:use",
    "rentals:read",
    "inventory:read",
    "vehicle_proof:create",
  ],
  viewer: ["admin:read"],
};

export const ROLE_TASK_CATEGORIES: Record<TeamRole, TeamTaskCategory[]> = {
  owner: ["marketplace", "rentals", "communications", "paperwork", "lot", "social"],
  manager: ["marketplace", "rentals", "communications", "paperwork", "lot", "social"],
  sales: ["marketplace", "communications", "rentals"],
  finance: ["communications", "paperwork", "rentals"],
  mechanic: ["lot"],
  registration: ["paperwork", "rentals"],
  social: ["social", "marketplace"],
  lot: ["lot", "rentals"],
  viewer: [],
};

export function isTeamRole(value: string | null | undefined): value is TeamRole {
  return TEAM_ROLES.includes(value as TeamRole);
}

export function hasTeamPermission(
  role: TeamRole | null | undefined,
  permission: TeamPermission,
): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes("admin:all") || permissions.includes(permission);
}

export function canWorkTaskCategory(
  role: TeamRole | null | undefined,
  category: TeamTaskCategory,
): boolean {
  if (!role) return false;
  if (hasTeamPermission(role, "admin:all") || hasTeamPermission(role, "tasks:manage")) {
    return true;
  }
  return ROLE_TASK_CATEGORIES[role]?.includes(category) ?? false;
}

export function roleDisplayName(role: TeamRole | null | undefined): string {
  return role ? ROLE_LABELS[role] : "Unassigned";
}
