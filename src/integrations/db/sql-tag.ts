import { getDb } from "./index";

// Re-export the tagged sql function from the singleton
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  const query = getDb() as unknown as (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => unknown;
  return query(strings, ...values);
}
