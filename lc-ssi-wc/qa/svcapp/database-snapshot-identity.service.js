"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseSnapshotIdentityService = exports.databaseSnapshotIdentity = exports.normalizeSqliteValue = exports.quoteSqliteIdentifier = exports.SQLITE_SNAPSHOT_IDENTITY_METHOD = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_sqlite_1 = require("node:sqlite");
const canonical_json_1 = require("./canonical-json");
exports.SQLITE_SNAPSHOT_IDENTITY_METHOD = "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1";
const quoteSqliteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
exports.quoteSqliteIdentifier = quoteSqliteIdentifier;
const normalizeSqliteValue = (value) => {
    if (value === undefined)
        return null;
    if (typeof value === "bigint")
        return { bigint: value.toString() };
    if (value instanceof Uint8Array)
        return { base64: Buffer.from(value).toString("base64") };
    return value;
};
exports.normalizeSqliteValue = normalizeSqliteValue;
const databaseSnapshotIdentity = (database) => {
    const tables = database
        .prepare(`SELECT name, sql FROM sqlite_schema
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`)
        .all();
    const snapshot = tables.map(({ name, sql }) => {
        const columns = database
            .prepare(`PRAGMA table_info(${(0, exports.quoteSqliteIdentifier)(name)})`)
            .all();
        const names = columns.map((column) => column.name);
        const projection = names.map(exports.quoteSqliteIdentifier).join(", ");
        const ordering = names.map(exports.quoteSqliteIdentifier).join(", ");
        const rows = database
            .prepare(`SELECT ${projection} FROM ${(0, exports.quoteSqliteIdentifier)(name)}${ordering ? ` ORDER BY ${ordering}` : ""}`)
            .all()
            .map((row) => Object.fromEntries(names.map((column) => [
            column,
            (0, exports.normalizeSqliteValue)(row[column]),
        ])));
        return { name, sql, columns: names, rows };
    });
    return {
        sha256: (0, canonical_json_1.hashCanonical)({
            method: exports.SQLITE_SNAPSHOT_IDENTITY_METHOD,
            tables: snapshot,
        }),
        method: exports.SQLITE_SNAPSHOT_IDENTITY_METHOD,
    };
};
exports.databaseSnapshotIdentity = databaseSnapshotIdentity;
let DatabaseSnapshotIdentityService = class DatabaseSnapshotIdentityService {
    databasePath;
    constructor(databasePath) {
        this.databasePath =
            databasePath ?? process.env["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite";
    }
    current() {
        const database = new node_sqlite_1.DatabaseSync(this.databasePath, { readOnly: true });
        try {
            database.exec("BEGIN");
            return (0, exports.databaseSnapshotIdentity)(database);
        }
        finally {
            try {
                database.exec("ROLLBACK");
            }
            finally {
                database.close();
            }
        }
    }
};
exports.DatabaseSnapshotIdentityService = DatabaseSnapshotIdentityService;
exports.DatabaseSnapshotIdentityService = DatabaseSnapshotIdentityService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(0, (0, common_1.Optional)()),
    tslib_1.__param(0, (0, common_1.Inject)("SSI_DATABASE_PATH")),
    tslib_1.__metadata("design:paramtypes", [String])
], DatabaseSnapshotIdentityService);
//# sourceMappingURL=database-snapshot-identity.service.js.map