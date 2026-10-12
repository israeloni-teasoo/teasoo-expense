import { categoryLabel } from "@/lib/category-label";
import { api, nairaString } from "@/lib/api";
import { getExpenseDetail } from "@/lib/services/expenses";

export const GET = api(async (user, _req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const d = await getExpenseDetail(user, id);
  return {
    expense: { ...d.expense, amount: nairaString(d.expense.amount), amountKobo: d.expense.amount },
    allocation: { id: d.allocation.id, reference: d.allocation.reference, purpose: d.allocation.purpose },
    staff: d.staff,
    category: categoryLabel(d.category?.name, d.expense.categoryOther),
    documents: d.documents.map((doc) => ({ id: doc.id, fileName: doc.fileName, fileType: doc.fileType, fileSize: doc.fileSize, kind: doc.kind, url: `/api/documents/${doc.id}` })),
    reviews: d.reviews.map((r) => ({ action: r.action, by: r.reviewerName, comment: r.comment, at: r.createdAt })),
    balance: d.balance,
  };
});
