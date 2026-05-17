import { z } from "zod";

const supplierSlugRegex = /^[a-z0-9-]+$/;

export const saveScheduleSchema = z.object({
  supplierSlug: z.string().min(1).max(64).regex(supplierSlugRegex),
  enabled: z.boolean(),
  dailyHourUtc: z.number().int().min(0).max(23),
});

export const triggerInputSchema = z.object({
  supplierSlug: z.string().min(1).max(64).regex(supplierSlugRegex),
});

export type SaveScheduleInput = z.infer<typeof saveScheduleSchema>;
export type TriggerInput = z.infer<typeof triggerInputSchema>;
