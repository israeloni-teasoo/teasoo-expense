import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { ProjectForm } from "@/components/forms/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader, Progress } from "@/components/ui/misc";
import { ModalButton } from "@/components/ui/modal";
import { requirePagePermission } from "@/lib/auth/current";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getLookups } from "@/lib/services/org";
import { projectReport } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requirePagePermission("admin.config");
  const [{ projects, activeDepartments }, report] = await Promise.all([getLookups(user.organisationId), projectReport(user, { from: null, to: null })]);
  const stats = new Map(report.map((r) => [r.id, r]));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Projects"
        description="Group allocations and expenses for project-level reporting."
        actions={<ModalButton label="Add project" variant="primary" icon={<Plus className="h-4 w-4" />} title="Add project"><ProjectForm departments={activeDepartments} /></ModalButton>}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => {
          const s = stats.get(p.id);
          const used = p.budget ? Math.round(((s?.expenses ?? 0) / p.budget) * 100) : 0;
          return (
            <Card key={p.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{p.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {p.code ?? "—"}
                    {p.startDate ? ` · ${formatDate(p.startDate, "short")} – ${formatDate(p.endDate, "short")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {p.archived && <Badge>Archived</Badge>}
                  <ModalButton label="Edit" size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} title={`Edit ${p.name}`}>
                    <ProjectForm p={p} departments={activeDepartments} />
                  </ModalButton>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-gray-500">Budget</dt><dd className="font-medium tabular-nums">{p.budget ? formatMoney(p.budget) : "—"}</dd></div>
                <div><dt className="text-xs text-gray-500">Funded</dt><dd className="font-medium tabular-nums">{formatMoney(s?.received ?? 0)}</dd></div>
                <div><dt className="text-xs text-gray-500">Spent</dt><dd className="font-medium tabular-nums">{formatMoney(s?.expenses ?? 0)}</dd></div>
              </dl>
              {p.budget ? (
                <div className="mt-3 flex items-center gap-2">
                  <Progress value={used} className="flex-1" />
                  <span className="text-xs tabular-nums text-gray-500">{used}% of budget</span>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
