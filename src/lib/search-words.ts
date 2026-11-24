/** Name search over several columns, word by word: "Rita Muster" finds the contact whose first name has "Rita" and
 *  whose last name has "Muster" (each word must match one of the columns; one PostgREST `or` per word, ANDed). */
export function searchWords(q: string) {
  return q
    .replace(/[%,()*\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
}

export function matchWords<Q extends { or: (filters: string, opts?: { referencedTable?: string }) => Q }>(query: Q, q: string, columns: string[], opts?: { referencedTable?: string }): Q {
  for (const w of searchWords(q)) query = query.or(columns.map((c) => `${c}.ilike.%${w}%`).join(","), opts)
  return query
}
