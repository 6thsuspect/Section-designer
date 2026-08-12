import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const sections = pgTable('sections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').default(''),
  projectData: jsonb('project_data').notNull(), // Full SectionProject JSON
  revision: integer('revision').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
