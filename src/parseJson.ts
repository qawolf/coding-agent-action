export function parseJson(text: string): { value: unknown } | "not-json" {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return "not-json";
  }
}
