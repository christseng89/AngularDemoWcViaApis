"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevelopmentDataReloadService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_sqlite_1 = require("node:sqlite");
const canonical_json_1 = require("./canonical-json");
const database_snapshot_identity_service_1 = require("./database-snapshot-identity.service");
const runtime_environment_policy_1 = require("./runtime-environment.policy");
const digest = (value) => (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
const secureEquals = (actual, expected) => (0, node_crypto_1.timingSafeEqual)(Buffer.from(digest(actual), "hex"), Buffer.from(digest(expected), "hex"));
const decodeSeedValue = (value) => {
    if (value &&
        typeof value === "object" &&
        Object.keys(value).length === 1 &&
        typeof value.$base64 === "string")
        return Buffer.from(value.$base64, "base64");
    return value;
};
const normalizedSeedValue = (value) => (0, database_snapshot_identity_service_1.normalizeSqliteValue)(decodeSeedValue(value));
const parseSeed = (raw) => {
    const seed = JSON.parse(raw);
    if (seed.schemaVersion !== "1.0" ||
        seed.classification !== "SYNTHETIC_DEMO_QA_UAT" ||
        seed.identityMethod !== database_snapshot_identity_service_1.SQLITE_SNAPSHOT_IDENTITY_METHOD ||
        !seed.fixtureId ||
        !Array.isArray(seed.schema) ||
        !seed.tables)
        throw new Error("canonical seed metadata is invalid");
    return seed;
};
const seedIdentity = (seed) => {
    const schemaByName = new Map(seed.schema
        .filter((item) => item.type === "table")
        .map((item) => [item.name, item]));
    const tables = Object.entries(seed.tables)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, table]) => ({
        name,
        sql: schemaByName.get(name)?.sql ?? null,
        columns: [...table.columns],
        rows: table.rows.map((row) => Object.fromEntries(table.columns.map((column, index) => [
            column,
            normalizedSeedValue(row[index]),
        ]))),
    }));
    return (0, canonical_json_1.hashCanonical)({ method: seed.identityMethod, tables });
};
const failure = (status, code) => {
    throw new common_1.HttpException({ code, retryable: false, payloadGenerated: false }, status);
};
let DevelopmentDataReloadService = class DevelopmentDataReloadService {
    environment;
    reloading = false;
    constructor(environment = process.env) {
        this.environment = environment;
    }
    status() {
        const runtime = (0, runtime_environment_policy_1.resolveRuntimeEnvironment)(this.environment);
        const password = this.environment["SSI_DEMO_ADMIN_PASSWORD"]?.trim();
        const seedPath = this.seedPath();
        try {
            const raw = (0, node_fs_1.readFileSync)(seedPath);
            const seed = parseSeed(raw.toString("utf8"));
            return {
                ...runtime,
                reloadAvailable: runtime.developmentEnabled && Boolean(password),
                fixtureId: seed.fixtureId,
                seedSha256: digest(raw),
                statusPolicyVersion: "SSI-CONFIG-HTTP-01",
            };
        }
        catch {
            return {
                ...runtime,
                reloadAvailable: false,
                statusPolicyVersion: "SSI-CONFIG-HTTP-01",
            };
        }
    }
    reload(password) {
        const status = this.status();
        if (!status.developmentEnabled)
            failure(403, "DEVELOPMENT_MODE_REQUIRED");
        const expected = this.environment["SSI_DEMO_ADMIN_PASSWORD"]?.trim();
        if (!expected)
            failure(503, "DEMO_RELOAD_NOT_CONFIGURED");
        if (!password || !secureEquals(password, expected ?? ""))
            failure(401, "INVALID_DEMO_CONTROL_PASSWORD");
        if (this.reloading)
            failure(409, "DEMO_RELOAD_IN_PROGRESS");
        this.reloading = true;
        const database = new node_sqlite_1.DatabaseSync(this.databasePath());
        try {
            const raw = (0, node_fs_1.readFileSync)(this.seedPath());
            const seed = parseSeed(raw.toString("utf8"));
            this.validateSchema(database, seed);
            const expectedIdentity = seedIdentity(seed);
            database.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON;");
            try {
                const tableNames = Object.keys(seed.tables).sort().reverse();
                for (const name of tableNames)
                    database.exec(`DELETE FROM ${(0, database_snapshot_identity_service_1.quoteSqliteIdentifier)(name)}`);
                for (const name of Object.keys(seed.tables).sort())
                    this.insertTable(database, name, seed.tables[name]);
                const integrity = String(database.prepare("PRAGMA integrity_check").get()["integrity_check"]);
                if (integrity !== "ok")
                    throw new Error("SQLite integrity check failed");
                const identity = (0, database_snapshot_identity_service_1.databaseSnapshotIdentity)(database);
                if (identity.sha256.toLowerCase() !== expectedIdentity.toLowerCase())
                    throw new Error("logical snapshot identity mismatch");
                database.exec("COMMIT");
                return {
                    ...status,
                    code: "DEMO_DATA_RELOADED",
                    completedAt: new Date().toISOString(),
                    snapshotHash: identity.sha256,
                    snapshotIdentityMethod: identity.method,
                    importedRows: Object.fromEntries(Object.entries(seed.tables).map(([name, table]) => [name, table.rows.length])),
                };
            }
            catch (error) {
                database.exec("ROLLBACK");
                throw error;
            }
        }
        catch (error) {
            if (error instanceof common_1.HttpException)
                throw error;
            return failure(500, "DEMO_DATA_RELOAD_FAILED");
        }
        finally {
            database.close();
            this.reloading = false;
        }
    }
    validateSchema(database, seed) {
        const actual = database
            .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .all().map((item) => item.name);
        const expected = Object.keys(seed.tables).sort();
        if (JSON.stringify(actual) !== JSON.stringify(expected))
            throw new Error("active database schema does not match the canonical seed");
        for (const name of expected) {
            const columns = database
                .prepare(`PRAGMA table_info(${(0, database_snapshot_identity_service_1.quoteSqliteIdentifier)(name)})`)
                .all().map((item) => item.name);
            if (JSON.stringify(columns) !== JSON.stringify(seed.tables[name].columns))
                throw new Error(`table schema mismatch: ${name}`);
        }
    }
    insertTable(database, name, table) {
        const columns = table.columns.map(database_snapshot_identity_service_1.quoteSqliteIdentifier).join(",");
        const placeholders = table.columns.map(() => "?").join(",");
        const insert = database.prepare(`INSERT INTO ${(0, database_snapshot_identity_service_1.quoteSqliteIdentifier)(name)} (${columns}) VALUES (${placeholders})`);
        for (const row of table.rows)
            insert.run(...row.map(decodeSeedValue));
    }
    databasePath() {
        return (0, node_path_1.resolve)(this.environment["SSI_DATABASE_PATH"] ?? "./data/ssi-demo.sqlite");
    }
    seedPath() {
        return (0, node_path_1.resolve)(this.environment["SSI_DEMO_SEED_PATH"] ??
            "./fixtures/ssi-demo.v15.3.canonical.seed.json");
    }
};
exports.DevelopmentDataReloadService = DevelopmentDataReloadService;
exports.DevelopmentDataReloadService = DevelopmentDataReloadService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__param(0, (0, common_1.Optional)()),
    tslib_1.__param(0, (0, common_1.Inject)("SSI_RUNTIME_ENVIRONMENT")),
    tslib_1.__metadata("design:paramtypes", [Object])
], DevelopmentDataReloadService);
//# sourceMappingURL=development-data-reload.service.js.map