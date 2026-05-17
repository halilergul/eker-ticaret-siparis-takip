import { createHash } from "node:crypto";

export type DispatchScrapeInput = {
  supplierSlug: string;
  triggerType: "manual";
};

export type DispatchResult =
  | { ok: true }
  | { ok: false; status: number; bodyHash: string };

const WORKFLOW_FILE = "scrape.yml";

export async function dispatchScrapeWorkflow(
  input: DispatchScrapeInput,
): Promise<DispatchResult> {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const pat = process.env.GITHUB_PAT;
  const ref = process.env.GITHUB_REF_BRANCH ?? "master";

  if (!owner || !repo || !pat) {
    return { ok: false, status: 0, bodyHash: "missing-env" };
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        supplier: input.supplierSlug,
        trigger_type: input.triggerType,
      },
    }),
  });

  if (res.status === 204) {
    return { ok: true };
  }

  const text = await res.text().catch(() => "");
  const bodyHash = createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 16);

  console.error(
    `[workflow-dispatch] failed status=${res.status} supplier=${input.supplierSlug} bodyHash=${bodyHash}`,
  );

  return { ok: false, status: res.status, bodyHash };
}
