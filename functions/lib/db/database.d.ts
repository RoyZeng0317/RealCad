import pg from 'pg';
export declare function getPool(): pg.Pool;
export declare function query(text: string, params?: any[]): Promise<pg.QueryResult>;
export declare function getRow(text: string, params?: any[]): Promise<any>;
export declare function getRows(text: string, params?: any[]): Promise<any[]>;
export declare function run(text: string, params?: any[]): Promise<pg.QueryResult>;
export declare function initSchema(): Promise<void>;
export declare function closePool(): Promise<void>;
//# sourceMappingURL=database.d.ts.map