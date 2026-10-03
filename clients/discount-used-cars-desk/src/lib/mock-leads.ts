import type { Lead, LeadStatus } from "@/types/database";
import { getMockAdminVehicles } from "@/lib/mock-vehicles";

const now = Date.now();
const DAY = 86_400_000;

const MOCK_LEADS: Lead[] = [
  {
    id: "lead-1",
    name: "Maria Garcia",
    email: "maria.garcia@email.com",
    phone: "8325551234",
    message: "[Vehicle: 2019 Toyota Camry SE] Interested in this car, is it still available?",
    vehicleId: "mock-1",
    source: "vehicle_inquiry",
    status: "New",
    buyerName: null,
    buyerPhone: null,
    createdAt: new Date(now - DAY * 0.5).toISOString(),
  },
  {
    id: "lead-2",
    name: "Jose Hernandez",
    email: null,
    phone: "7135559876",
    message: "I need a reliable SUV for my family. What do you have under $7000?",
    vehicleId: null,
    source: "contact_form",
    status: "New",
    buyerName: null,
    buyerPhone: null,
    createdAt: new Date(now - DAY * 1).toISOString(),
  },
  {
    id: "lead-3",
    name: "Carlos Martinez",
    email: "carlos.m@gmail.com",
    phone: "2815554567",
    message: "[Vehicle: 2018 Honda CR-V EX] What's the down payment? I can do $1500 down.",
    vehicleId: "mock-2",
    source: "financing_inquiry",
    status: "Contacted",
    buyerName: null,
    buyerPhone: null,
    createdAt: new Date(now - DAY * 2).toISOString(),
  },
  {
    id: "lead-4",
    name: "Ana Rodriguez",
    email: "ana.rod@yahoo.com",
    phone: "8325558901",
    message: "Looking for a sedan for my daughter. She just got her license.",
    vehicleId: null,
    source: "contact_form",
    status: "Contacted",
    buyerName: null,
    buyerPhone: null,
    createdAt: new Date(now - DAY * 3).toISOString(),
  },
  {
    id: "lead-5",
    name: "Miguel Lopez",
    email: null,
    phone: "7135552345",
    message: "[Vehicle: 2017 Ford Explorer XLT] Can I schedule a test drive this Saturday?",
    vehicleId: "mock-4",
    source: "schedule_visit",
    status: "Sold",
    buyerName: "Miguel Lopez",
    buyerPhone: "7135552345",
    createdAt: new Date(now - DAY * 5).toISOString(),
  },
  {
    id: "lead-6",
    name: "Rosa Sanchez",
    email: "rosa.s@hotmail.com",
    phone: "8325556789",
    message: "I want to know about your financing options. My credit isn't great.",
    vehicleId: null,
    source: "financing_inquiry",
    status: "Sold",
    buyerName: "Rosa Sanchez",
    buyerPhone: "8325556789",
    createdAt: new Date(now - DAY * 6).toISOString(),
  },
  {
    id: "lead-7",
    name: "David Reyes",
    email: null,
    phone: "2815553456",
    message: "[Vehicle: 2021 Chevrolet Malibu LT] Is the price negotiable?",
    vehicleId: "mock-5",
    source: "vehicle_inquiry",
    status: "New",
    buyerName: null,
    buyerPhone: null,
    createdAt: new Date(now - DAY * 0.2).toISOString(),
  },
];

export function getMockLeads(status?: LeadStatus): Lead[] {
  let results = [...MOCK_LEADS];
  if (status) {
    results = results.filter((l) => l.status === status);
  }
  // Newest first
  results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return results;
}

export function getMockLeadCountsByStatus(): Record<LeadStatus, number> {
  const counts: Record<LeadStatus, number> = {
    New: 0, Contacted: 0, Qualified: 0, Appointment: 0,
    Negotiation: 0, Sold: 0, Lost: 0,
  };
  for (const lead of MOCK_LEADS) {
    counts[lead.status]++;
  }
  return counts;
}

export function getMockLeadStats(): {
  totalVehicles: number;
  totalLeads: number;
  newLeads: number;
} {
  const vehicles = getMockAdminVehicles();
  const leads = MOCK_LEADS;
  return {
    totalVehicles: vehicles.length,
    totalLeads: leads.length,
    newLeads: leads.filter((l) => l.status === "New").length,
  };
}
