declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  interface Database {
    run(sql: string, params?: any[]): void;
    prepare(sql: string): Statement;
    exec(sql: string): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(params?: any[]): any;
    get(params?: any[]): any[];
    getColumnNames(): string[];
    free(): boolean;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
    wasmBinary?: ArrayBuffer | Uint8Array;
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
  export { Database, Statement, QueryExecResult, SqlJsStatic, InitSqlJsConfig };
}
