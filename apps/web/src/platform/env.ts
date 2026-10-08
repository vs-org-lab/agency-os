import { z } from 'zod';

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  DATABASE_URL: z.string().startsWith('postgres'),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SESSION_ACTIVITY_SECRET: z.string().min(32),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function publicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function serverEnv(): ServerEnv {
  cachedServerEnv ??= serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SESSION_ACTIVITY_SECRET: process.env.SESSION_ACTIVITY_SECRET,
  });
  return cachedServerEnv;
}

const commercialEnvSchema = z.object({
  PUBLIC_LINK_SECRET: z.string().min(32),
  PUBLIC_ORGANIZATION_SLUG: z.string().min(1),
  APP_BASE_URL: z.url(),
  APPLY_IP_LIMIT_PER_HOUR: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().default(5),
  ),
});

export type CommercialEnv = z.infer<typeof commercialEnvSchema>;

let cachedCommercialEnv: CommercialEnv | undefined;

export function commercialEnv(): CommercialEnv {
  cachedCommercialEnv ??= commercialEnvSchema.parse({
    PUBLIC_LINK_SECRET: process.env.PUBLIC_LINK_SECRET,
    PUBLIC_ORGANIZATION_SLUG: process.env.PUBLIC_ORGANIZATION_SLUG,
    APP_BASE_URL:
      process.env.APP_BASE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
    APPLY_IP_LIMIT_PER_HOUR: process.env.APPLY_IP_LIMIT_PER_HOUR,
  });
  return cachedCommercialEnv;
}

const calendarEnvSchema = z.discriminatedUnion('CALENDAR_PROVIDER', [
  z.object({ CALENDAR_PROVIDER: z.literal('fake') }),
  z.object({
    CALENDAR_PROVIDER: z.literal('google'),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
  }),
]);

export type CalendarEnv = z.infer<typeof calendarEnvSchema>;

let cachedCalendarEnv: CalendarEnv | undefined;

export function calendarEnv(): CalendarEnv {
  cachedCalendarEnv ??= calendarEnvSchema.parse({
    CALENDAR_PROVIDER: process.env.CALENDAR_PROVIDER ?? 'fake',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  });
  return cachedCalendarEnv;
}

const transcriptionEnvSchema = z.discriminatedUnion('TRANSCRIPTION_PROVIDER', [
  z.object({ TRANSCRIPTION_PROVIDER: z.literal('fake') }),
  z.object({
    TRANSCRIPTION_PROVIDER: z.literal('groq'),
    GROQ_API_KEY: z.string().min(1),
  }),
]);

export type TranscriptionEnv = z.infer<typeof transcriptionEnvSchema>;

let cachedTranscriptionEnv: TranscriptionEnv | undefined;

export function transcriptionEnv(): TranscriptionEnv {
  cachedTranscriptionEnv ??= transcriptionEnvSchema.parse({
    TRANSCRIPTION_PROVIDER: process.env.TRANSCRIPTION_PROVIDER ?? 'fake',
    GROQ_API_KEY: process.env.GROQ_API_KEY,
  });
  return cachedTranscriptionEnv;
}

const emailEnvSchema = z.discriminatedUnion('EMAIL_TRANSPORT', [
  z.object({ EMAIL_TRANSPORT: z.literal('capture') }),
  z.object({
    EMAIL_TRANSPORT: z.literal('smtp'),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_USER: z.string().min(1),
    SMTP_PASSWORD: z.string().min(1),
  }),
]);

export type EmailEnv = z.infer<typeof emailEnvSchema>;

let cachedEmailEnv: EmailEnv | undefined;

export function emailEnv(): EmailEnv {
  cachedEmailEnv ??= emailEnvSchema.parse({
    EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  });
  return cachedEmailEnv;
}
