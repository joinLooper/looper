/** Per-client codec: never mutate pg's global type parser registry. */
export function safeInteger(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new RangeError(
        "Database integer is outside the JavaScript safe integer contract",
      );
    return value;
  }
  if (
    typeof value !== "bigint" &&
    (typeof value !== "string" || !/^-?\d+$/.test(value))
  )
    throw new TypeError("Expected a database integer");
  const integer = BigInt(value);
  if (
    integer > BigInt(Number.MAX_SAFE_INTEGER) ||
    integer < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new RangeError(
      "Database integer is outside the JavaScript safe integer contract",
    );
  return Number(integer);
}
