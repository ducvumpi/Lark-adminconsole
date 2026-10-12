

export async function searchRecords(
  query: string,
  fieldNames: string[],
  options?: { getLarkClient: () => LarkBaseClient; pageSize?: number }
): Promise<{ filter: string; total: number; items: LarkRecord[]; candidateFields: string[] }> {
  const client = options?.getLarkClient();
  const pageSize = options?.pageSize ?? 20;
  if (!client) {
    throw new Error("getLarkClient is required");
  }

  const parsed = await parseUserQuery(query, fieldNames);
  if (!parsed) {
    throw new Error("Không thể parse truy vấn");
  }

  const candidateFields = inferFieldCandidates(fieldNames, parsed.fieldTerm).slice(0, 10);

  for (const fieldName of candidateFields) {
    const filter = buildLarkFilter(fieldName, parsed);
    if (!filter) continue;

    try {
      const result = await client.listRecords({ filter, pageSize });
      if (result.total > 0) {
        return { filter, total: result.total, items: result.items.slice(0, pageSize), candidateFields };
      }
    } catch {
      continue;
    }
  }

  const matches = await scanRecords(client, parsed, candidateFields, pageSize);
  return {
    filter: `manual scan over fields: ${candidateFields.join(", ")}`,
    total: matches.length,
    items: matches,
    candidateFields,
  };
}