import codes from "@/data/budget-codes.json";

export interface BudgetCode {
  code: string;
  group: string;
  level: 1 | 2 | 3;
  parentCode: string | null;
}

/** Shared catalog. Four-digit suffixes belong to their two-digit parent. */
export const budgetCodes: BudgetCode[] = codes.map((code) => {
  const [root, suffix] = code.split("-");
  return {
    code,
    group: root.slice(0, 3),
    level: !suffix ? 1 : suffix.length === 2 ? 2 : 3,
    parentCode: !suffix ? null : suffix.length === 2 ? root : `${root}-${suffix.slice(0, 2)}`,
  };
});

export const budgetCodeGroups = [...new Set(budgetCodes.map((item) => item.group))];

const rootsWithChildren = new Set(
  budgetCodes.filter((item) => item.level > 1).map((item) => item.code.split("-")[0])
);

/** Root-only requests use a synthetic leaf only for catalog roots with children. */
export function getRootOnlyImportCode(code: string): string {
  return rootsWithChildren.has(code) ? `${code}-00-00` : code;
}
