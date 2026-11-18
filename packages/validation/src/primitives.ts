import { z } from 'zod';

export const idSchema = z.uuid();
export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes only');
export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
export const isoDateSchema = z.iso.datetime({ offset: true });

export const paginationSchema = z.object({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.infer<typeof paginationSchema>;
