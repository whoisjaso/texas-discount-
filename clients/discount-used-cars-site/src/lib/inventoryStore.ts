import { inventory, type Vehicle } from '../data/inventory';

/**
 * Single read path for inventory. The admin dashboard will replace this
 * implementation (e.g. a Supabase query) without touching any page code.
 */
export function getInventory(): Vehicle[] {
  return inventory;
}

export function getVehicle(slug: string): Vehicle | undefined {
  return getInventory().find((v) => v.slug === slug);
}

export function getFeatured(): Vehicle[] {
  return getInventory().filter((v) => v.featured);
}
