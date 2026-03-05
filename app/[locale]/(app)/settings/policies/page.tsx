import { redirect } from "next/navigation";

export default async function PoliciesRedirect({
  params,
}: {
  params: { locale: string };
}) {
  const locale = params?.locale ?? "en";
  redirect(`/${locale}/settings?section=policies`);
}
