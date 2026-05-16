import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email alanı boş bırakılamaz")
    .email("Geçerli bir email adresi girin"),
  password: z.string().min(1, "Şifre boş bırakılamaz"),
});

export type LoginInput = z.infer<typeof loginSchema>;
