declare module "better-sqlite3" {
  type SqlBind = string | number | bigint | null;

  interface Statement {
    run(...params: SqlBind[]): unknown;
    get(...params: SqlBind[]): unknown;
    all(...params: SqlBind[]): unknown[];
  }

  interface Database {
    exec(sql: string): Database;
    prepare(sql: string): Statement;
    pragma(source: string): unknown;
    transaction<T>(fn: () => T): () => T;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string): Database;
    (filename: string): Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}
