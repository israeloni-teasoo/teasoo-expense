import { sql } from "drizzle-orm";
import { expenseCategories, expenses } from "@/db/schema";

/** "Others: Gifts" when staff typed their own category, otherwise the category name. */
export function categoryLabel(name: string | null | undefined, other: string | null | undefined) {
  if (!name) return other?.trim() || "—";
  return other?.trim() ? `${name}: ${other.trim()}` : name;
}

/** SQL version of categoryLabel for list queries joining expenses and expense_categories. */
export const categoryLabelSql = sql<string>`case when coalesce(${expenses.categoryOther}, '') <> '' then ${expenseCategories.name} || ': ' || ${expenses.categoryOther} else ${expenseCategories.name} end`;
