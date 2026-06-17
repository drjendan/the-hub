import { requireOrgOwner } from "@/lib/auth";
import { listMaskedProviderKeys } from "@/lib/provider-keys";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { orgId } = await requireOrgOwner();
  const keys = await listMaskedProviderKeys(orgId);

  return (
    <div className="px-6 sm:px-10 py-8 max-w-3xl mx-auto">
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">
          Company settings
        </div>
        <h1 className="display text-[30px] font-semibold leading-none">AI Provider Keys</h1>
        <p className="mt-2 max-w-xl text-[14px] text-ink-soft">
          Add your company&apos;s own provider key so agent runs bill to your account. Keys are
          encrypted at rest and used only to run your agents. We only ever show a masked preview —
          the full key can never be read back. If no key is set here, runs use the platform key.
        </p>
      </div>

      <SettingsClient initialKeys={keys} />
    </div>
  );
}
