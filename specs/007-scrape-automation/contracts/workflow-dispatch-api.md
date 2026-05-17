# Contract: GitHub `workflow_dispatch` API entegrasyonu

**File**: `lib/github/workflow-dispatch.ts`
**Type**: Server-only fetch wrapper (Node.js runtime)

## Function

```ts
export async function dispatchScrapeWorkflow(input: {
  supplierSlug: string;
  triggerType: 'manual'; // V1'de sadece manuel; cron tarafından çağrılmaz
}): Promise<{ ok: true } | { ok: false; status: number; bodyHash: string }>;
```

## Endpoint

```
POST https://api.github.com/repos/{owner}/{repo}/actions/workflows/scrape.yml/dispatches
```

`{owner}` ve `{repo}` `process.env.GITHUB_OWNER` ve `process.env.GITHUB_REPO`'dan okunur.

## Request

```http
POST .../dispatches
Authorization: Bearer {GITHUB_PAT}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "ref": "master",
  "inputs": {
    "supplier": "enderyapi",
    "trigger_type": "manual"
  }
}
```

## Response

- **204 No Content**: Başarılı. Workflow tetiklendi (run henüz başlamadı; saniyeler içinde queued → in_progress).
- **404 Not Found**: Workflow file yok ya da PAT scope yetersiz; `code: GITHUB_API_FAILED`.
- **401 Unauthorized**: PAT geçersiz / süresi dolmuş; `code: GITHUB_API_FAILED`.
- **422 Unprocessable**: `inputs.supplier` workflow file'ın `inputs` tanımıyla eşleşmiyor; `code: GITHUB_API_FAILED`.

## Error logging

Hata durumunda **token, full response body, repo URL** log'lara gitmez. Sadece:
- `status` (HTTP code)
- `bodyHash` (response body'nin sha256 hash'i — debug için, içerik açıklamaz)
- `supplier_slug` (input)

## Required env

| Variable | Where | Required | Notes |
|----------|-------|----------|-------|
| `GITHUB_PAT` | Vercel env (server-only) | YES | Fine-grained, `Actions: Read and write` scope, sadece bu repo |
| `GITHUB_OWNER` | Vercel env | YES | `halilergul` |
| `GITHUB_REPO` | Vercel env | YES | `eker-ticaret` |

`.env.local` (dev):
```
GITHUB_PAT=ghp_...
GITHUB_OWNER=halilergul
GITHUB_REPO=eker-ticaret
```

## Test

Local dev: PAT ile gerçek API'ye atılabilir (manuel test). Migration sırasında "test dispatch" workflow_dispatch UI'dan da denenebilir.
