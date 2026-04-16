export function substituteVariables(
  text: string,
  vars: Record<string, unknown>
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const value = (key as string)
      .trim()
      .split(".")
      .reduce(
        (obj: unknown, k: string) =>
          obj != null && typeof obj === "object"
            ? (obj as Record<string, unknown>)[k]
            : undefined,
        vars as unknown
      );
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}
