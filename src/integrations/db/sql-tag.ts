import { getDb } from "./index";

// Re-export the tagged sql function from the singleton
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return getDb()(strings as unknown as TemplateStringsArray, ...values);
}
