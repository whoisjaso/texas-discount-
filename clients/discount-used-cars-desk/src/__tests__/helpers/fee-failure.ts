import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A client whose reads of the fee schedule fail, for the fail-closed tests:
 * every other table answers as the wrapped client does. Use it from a
 * `vi.mock("@/lib/supabase/admin-data", ...)` factory.
 */
export function withFailingFeeTable(client: SupabaseClient): SupabaseClient {
  const failing = (): unknown => {
    const result = { data: null, error: { code: "57P01", message: "the fee table could not be read" } };
    const builder: Record<PropertyKey, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    const proxy: unknown = new Proxy(builder, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => proxy;
      },
    });
    return proxy;
  };
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "from") {
        return (table: string) => (table === "dealer_fee_schedule" ? failing() : target.from(table));
      }
      return Reflect.get(target, prop);
    },
  }) as SupabaseClient;
}
