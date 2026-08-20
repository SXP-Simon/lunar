export const LUNAR_DATABASE_NAME = 'lunar.db';

export interface DatabaseMigration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [];
