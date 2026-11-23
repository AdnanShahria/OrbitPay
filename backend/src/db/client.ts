/// <reference types="@cloudflare/workers-types" />
import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export const getDb = (d1: D1Database): DrizzleD1Database<typeof schema> => {
  return drizzle(d1, { schema });
};

export type AppDb = DrizzleD1Database<typeof schema>;
export { schema };
