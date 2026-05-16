"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { ROUTES } from "@/lib/routes";

export type SignInState = { error: string } | undefined;

const GENERIC_AUTH_ERROR = "Email veya şifre hatalı";
const RATE_LIMIT_ERROR =
  "Çok fazla deneme yapıldı, lütfen biraz sonra tekrar deneyin";
const NETWORK_ERROR = "Bağlantı sorunu. Lütfen tekrar deneyin.";
const GENERIC_ERROR = "Bir hata oluştu. Lütfen tekrar deneyin.";

function mapSupabaseError(message: string | undefined): string {
  if (!message) return GENERIC_ERROR;
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return GENERIC_AUTH_ERROR;
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return RATE_LIMIT_ERROR;
  }
  if (m.includes("network") || m.includes("fetch")) {
    return NETWORK_ERROR;
  }
  // Email enumeration koruması: "Email not confirmed" / "User not found" gibi
  // her durumda generic mesaj.
  return GENERIC_AUTH_ERROR;
}

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { error: firstIssue?.message ?? GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: mapSupabaseError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect(ROUTES.DASHBOARD);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    // signOut hatası kullanıcıya yansıtılmaz; cookie zaten temizlenir ve
    // redirect yapılır. Server log için sessiz tutuluyor.
    console.error("signOut error:", err);
  }
  revalidatePath("/", "layout");
  redirect(ROUTES.LOGIN);
}
