/** Translate only engine syntax used by the shared Store and compatibility probes. */
export function translateSql(source) {
  let sql = source.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
  sql = sql
    .replace(
      /json_extract\(([^,]+),\s*('[^']+')\)\s*(>=|<=|<>|>|<|=)\s*(\d+)/g,
      (_, doc, path, op, rhs) =>
        `sqlite_json_compare_number(${doc},${path},'${op}',${rhs})`,
    )
    .replace(/\bjson_extract\(/g, "sqlite_json_extract(")
    .replace(/\bjson_valid\(/g, "sqlite_json_valid(")
    .replace(/\bjson_set\(/g, "sqlite_json_set(")
    .replace(/\btypeof\(/g, "sqlite_typeof(")
    .replace(/\blower\(/gi, "sqlite_lower(")
    .replace(
      /([\w.]+)\s+NOT GLOB\s+(\?|\$\d+|'[^']*')/gi,
      "NOT sqlite_glob($1,$2)",
    )
    .replace(/([\w.]+)\s+GLOB\s+(\?|\$\d+|'[^']*')/gi, "sqlite_glob($1,$2)");
  sql = sql
    .replace(/\bIS NOT \?/gi, "IS DISTINCT FROM ?")
    .replace(/\bIS \?/gi, "IS NOT DISTINCT FROM ?");
  // SQLite LIKE has no backslash escape and lower() only folds ASCII.
  sql = sql.replace(
    /LIKE\s+(sqlite_lower\([^)]*\)|\?|'[^']*')/gi,
    "LIKE $1 ESCAPE ''",
  );
  sql = sql.replace(
    /ORDER BY([\s\S]*?)(?=\bLIMIT\b|\bOFFSET\b|;|$)/gi,
    (_, terms) =>
      "ORDER BY " +
      terms
        .split(",")
        .map((term) => {
          const t = term.trim();
          if (/NULLS\s+(FIRST|LAST)$/i.test(t)) return t;
          return /\bDESC$/i.test(t)
            ? t + " NULLS LAST"
            : t + (/\bASC$/i.test(t) ? "" : " ASC") + " NULLS FIRST";
        })
        .join(", ") +
      " ",
  );
  // USER is a PostgreSQL keyword; retain the Store's SQLite table alias.
  sql = sql
    .replace(/\buser\./g, '"user".')
    .replace(/\bJOIN users user\b/g, 'JOIN users "user"');
  let quoted = false,
    result = "",
    parameter = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      result += ch;
      if (quoted && sql[i + 1] === "'") {
        result += sql[++i];
        continue;
      }
      quoted = !quoted;
    } else result += ch === "?" && !quoted ? "$" + ++parameter : ch;
  }
  return result;
}
