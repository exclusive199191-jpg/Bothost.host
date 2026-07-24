import { z } from 'zod';
import { insertBotConfigSchema, botConfigs } from './schema';

export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type CreateBotInput = Omit<InsertBotConfig, 'userId'>;
export type UpdateBotConfig = Partial<z.infer<typeof insertBotConfigSchema>>;

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Paths are decoded at runtime — not stored as readable strings in the bundle
const K = 0x5F;
const _d = (a: number[]) => a.map(c => String.fromCharCode(c ^ K)).join('');

export const api = {
  bots: {
    list: {
      method: 'GET' as const,
      path: _d([112,62,47,54,112,61,48,43,44]),
      responses: {
        200: z.array(z.custom<typeof botConfigs.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: _d([112,62,47,54,112,61,48,43,44,112,101,54,59]),
      responses: {
        200: z.custom<typeof botConfigs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: _d([112,62,47,54,112,61,48,43,44]),
      input: insertBotConfigSchema.omit({ userId: true }),
      responses: {
        201: z.custom<typeof botConfigs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: _d([112,62,47,54,112,61,48,43,44,112,101,54,59]),
      input: insertBotConfigSchema.partial(),
      responses: {
        200: z.custom<typeof botConfigs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: _d([112,62,47,54,112,61,48,43,44,112,101,54,59]),
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    restart: {
      method: 'POST' as const,
      path: _d([112,62,47,54,112,61,48,43,44,112,101,54,59,112,45,58,44,43,62,45,43]),
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    stop: {
      method: 'POST' as const,
      path: _d([112,62,47,54,112,61,48,43,44,112,101,54,59,112,44,43,48,47]),
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
