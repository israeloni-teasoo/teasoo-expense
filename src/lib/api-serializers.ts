import "server-only";
import { nairaString } from "@/lib/api";
import type { AllocationListItem } from "@/lib/services/allocations";

export function serializeAllocation(a: AllocationListItem) {
  const b = a.balance;
  return {
    id: a.id,
    reference: a.reference,
    kind: a.kind,
    staff: { id: a.staffId, name: a.staffName },
    purpose: a.purpose,
    project: a.projectName,
    department: a.departmentName,
    currency: a.currency,
    dateReceived: a.dateReceived,
    expectedCompletionDate: a.expectedCompletionDate,
    status: a.status,
    overdue: a.overdue,
    readyToReconcile: a.readyToReconcile,
    balance: {
      received: nairaString(b.totalFunded),
      approved: nairaString(b.approved),
      pending: nairaString(b.pending),
      returned: nairaString(b.returned),
      available: nairaString(b.available),
      outstanding: nairaString(b.outstanding),
      utilisation: b.utilisation,
      overBudget: b.overBudget,
      kobo: b,
    },
  };
}

