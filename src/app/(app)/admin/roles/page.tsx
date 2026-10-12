import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/lib/auth/current";
import { can, PERMISSIONS, ROLE_LABELS, type Permission } from "@/lib/rbac";
import type { Role } from "@/db/schema";

export const metadata: Metadata = { title: "Roles & permissions" };

const ROLES: Role[] = ["STAFF", "ACCOUNTANT", "ADMIN", "MANAGEMENT"];
const DESCRIPTIONS: Record<Role, string> = {
  STAFF: "Receives funds, logs expenses and uploads receipts. Sees only their own records.",
  ACCOUNTANT: "Reviews expenses, records returns, reconciles allocations and produces reports.",
  ADMIN: "Everything an accountant can do, plus users, configuration and final claim approval.",
  MANAGEMENT: "Read-only dashboards, reports and exports. Cannot modify financial records.",
};

export default async function RolesPage() {
  await requirePagePermission("admin.users");
  return (
    <div>
      <PageHeader title="Roles & permissions" description="Access is role-based. Assign a role to each user from the Users screen." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <Card key={r} className="p-4">
            <p className="font-semibold text-gray-900">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-sm text-gray-500">{DESCRIPTIONS[r]}</p>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Permission</th>
              {ROLES.map((r) => (
                <th key={r} className="px-4 py-3 text-center">{ROLE_LABELS[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
              <tr key={p}>
                <td className="px-4 py-2.5 text-gray-700">{PERMISSIONS[p]}</td>
                {ROLES.map((r) => (
                  <td key={r} className="px-4 py-2.5 text-center">
                    {can(r, p) ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Yes" /> : <Minus className="mx-auto h-4 w-4 text-gray-300" aria-label="No" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-xs text-gray-500">Segregation of duties: nobody can approve their own expense or decide their own claim.</p>
    </div>
  );
}
