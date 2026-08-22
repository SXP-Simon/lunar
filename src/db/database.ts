import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { DATABASE_MIGRATIONS, LUNAR_DATABASE_NAME } from './migrations';

interface UserVersionRow {
  readonly user_version: number;
}

export async function openLunarDatabase(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(LUNAR_DATABASE_NAME);
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrateDatabase(database);
  return database;
}

export async function migrateDatabase(database: SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<UserVersionRow>('PRAGMA user_version');
  let currentVersion = row?.user_version ?? 0;

  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    await database.withExclusiveTransactionAsync(async (transaction) => {
      for (const statement of migration.statements) {
        await transaction.execAsync(statement);
      }
      await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
    currentVersion = migration.version;
  }
}
