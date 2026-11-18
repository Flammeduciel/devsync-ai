import { z } from 'zod';
import { emailSchema } from './primitives';

export const passwordSchema = z
  .string()
  .min(10, 'At least 10 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Must contain a letter')
  .regex(/[0-9]/, 'Must contain a digit');

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(80),
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Required').max(128),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
