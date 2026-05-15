---
name: nextjs-supabase-best-practices
description: Next.js 14+ App Router + Supabase best practices. Server Components default, RLS-first thinking, Tailwind + shadcn patterns. Triggers on creating routes, server actions, Supabase queries, authentication flows, or RLS policies.
---

# Next.js + Supabase Best Practices

## Server vs Client Components

**Default:** Server Component. Only add `"use client"` when you need:
- React hooks (`useState`, `useEffect`, `useContext`, etc.)
- Event handlers (`onClick`, `onChange`)
- Browser-only APIs (`window`, `localStorage`)
- Client-only libraries

**Anti-pattern:** Marking `"use client"` at the top of a page just because one child needs interactivity. Push the boundary down — keep the page Server, make only the interactive piece a Client Component.

## Data Fetching

**Server Component (default):**
```ts
import { createClient } from '@/lib/supabase/server';

export default async function Page() {
  const supabase = await createClient();
  const { data: posts } = await supabase.from('posts').select();
  return <PostList posts={posts ?? []} />;
}
```

**Client Component (only when needed):**
```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function SearchResults({ query }: { query: string }) {
  const { data } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      const supabase = createClient();
      return supabase.from('posts').select().textSearch('body', query);
    },
  });
  // ...
}
```

## Supabase Server Client

`lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}
```

## RLS-First Mindset

Every new table:
1. `ALTER TABLE x ENABLE ROW LEVEL SECURITY;`
2. Write policies for SELECT, INSERT, UPDATE, DELETE
3. Test from the client side, not the dashboard

Common policy:
```sql
CREATE POLICY "users can read own data" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users can update own data" ON profiles
  FOR UPDATE USING (auth.uid() = id);
```

## Forms with react-hook-form + zod

Shared schema:
```ts
// lib/validations/user.ts
import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().min(2),
  bio: z.string().max(500).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

Client form:
```ts
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfileSchema, type UpdateProfileInput } from '@/lib/validations/user';

export function ProfileForm() {
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
  });

  async function onSubmit(data: UpdateProfileInput) {
    await fetch('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>;
}
```

Server validation:
```ts
// app/api/profile/route.ts
import { updateProfileSchema } from '@/lib/validations/user';

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ success: false, error: { code: 'INVALID_INPUT', message: parsed.error.message }}, { status: 400 });
  }
  // ... use parsed.data
}
```

## Loading & Error States

App Router native:
- `loading.tsx` — Suspense boundary
- `error.tsx` — Error boundary
- `not-found.tsx` — 404

```tsx
// app/posts/loading.tsx
export default function Loading() {
  return <PostListSkeleton />;
}
```

## Image & Font

```tsx
import Image from 'next/image';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

<Image src="/hero.jpg" alt="" width={1200} height={600} priority />
```

## Environment Variables

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`.env.local` (gitignored):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Rule: `NEXT_PUBLIC_*` → safe in client bundle. Anything else → server-only.

## Common Anti-Patterns

- ❌ `"use client"` on a route segment when only a button is interactive
- ❌ `SUPABASE_SERVICE_ROLE_KEY` in any code marked `"use client"`
- ❌ Forgetting RLS — table accessible without policy → public data leak
- ❌ Fetching same data multiple times — use Server Component composition, lift data fetch up
- ❌ Manual loading states when `loading.tsx` does it cleaner
- ❌ Client-only validation — always validate again on server
