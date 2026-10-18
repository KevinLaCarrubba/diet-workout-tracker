import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL must be the project URL' }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20, 'VITE_SUPABASE_PUBLISHABLE_KEY is required')
    .refine((key) => !key.startsWith('sb_secret_'), 'Never ship a secret key to the browser'),
  VITE_VAPID_PUBLIC_KEY: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration (see .env.example):\n${issues}`);
  }
  return result.data;
}

export const env = parseEnv(import.meta.env);
