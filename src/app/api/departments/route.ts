import { api } from "@/lib/api";
import { getLookups } from "@/lib/services/org";

export const GET = api(async (user) => {
  const l = await getLookups(user.organisationId);
  return { data: l.departments };
});
