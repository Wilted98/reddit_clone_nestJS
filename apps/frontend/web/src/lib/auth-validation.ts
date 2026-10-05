import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const registrationSchema = signInSchema.extend({
  username: z
    .string()
    .min(3, 'Use at least 3 characters.')
    .max(20, 'Use at most 20 characters.')
    .regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, or underscores.'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .regex(/[a-z]/, 'Include a lowercase letter.')
    .regex(/[A-Z]/, 'Include an uppercase letter.')
    .regex(/[0-9]/, 'Include a number.')
    .regex(/[^a-zA-Z0-9\s]/, 'Include a symbol.'),
});

export type SignInFields = z.infer<typeof signInSchema>;
export type RegistrationFields = z.infer<typeof registrationSchema>;
