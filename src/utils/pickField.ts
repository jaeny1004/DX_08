type FieldSource =
  | Record<string, unknown>
  | null
  | undefined;

type FieldValidator = (
  value: unknown,
  key: string,
) => boolean;

function hasFieldValue(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
  );
}

export function pickField(
  source: FieldSource,
  keys: readonly string[],
  isValid?: FieldValidator,
): unknown | undefined {
  if (!source) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (
      hasFieldValue(value) &&
      (!isValid || isValid(value, key))
    ) {
      return value;
    }
  }

  return undefined;
}

export function pickTextField(
  source: FieldSource,
  keys: readonly string[],
): string {
  const value = pickField(source, keys);
  return value === undefined
    ? ""
    : String(value).trim().replace(/\.0$/, "");
}
