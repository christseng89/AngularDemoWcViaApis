"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwiftDataImportService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const ssi_application_service_1 = require("../ssi-application.service");
const rma_application_service_1 = require("../rma/rma-application.service");
const nostro_application_service_1 = require("../nostro/nostro-application.service");
const validEnvelope = (request) => Boolean(request.fileName?.endsWith(".json")) &&
    Boolean(request.idempotencyKey) &&
    Array.isArray(request.records) &&
    request.records.length >= 1 &&
    request.records.length <= 500 &&
    ["SSI", "RMA", "NOSTRO"].includes(request.dataType);
const checksumFor = (records) => (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(records)).digest("hex");
let SwiftDataImportService = class SwiftDataImportService {
    ssi;
    rma;
    nostro;
    completed = new Map();
    constructor(ssi, rma, nostro) {
        this.ssi = ssi;
        this.rma = rma;
        this.nostro = nostro;
    }
    import(request) {
        if (!validEnvelope(request))
            throw new common_1.BadRequestException("INVALID_IMPORT_ENVELOPE");
        const actual = checksumFor(request.records);
        if (request.checksum && request.checksum.toLowerCase() !== actual)
            throw new common_1.BadRequestException("CHECKSUM_MISMATCH");
        if (this.completed.has(request.idempotencyKey))
            return this.completed.get(request.idempotencyKey);
        const results = request.records.map((record, index) => this.importRecord(request, record, index));
        const response = this.importResponse(request, actual, results);
        if (!request.dryRun)
            this.completed.set(request.idempotencyKey, response);
        return response;
    }
    importRecord(request, record, index) {
        try {
            if (request.dryRun) {
                this.validateRecord(request.dataType, record);
                return { row: index + 1, status: "VALIDATED" };
            }
            const created = this.createRecord(request.dataType, record);
            return { row: index + 1, status: "DRAFT_CREATED", id: created.id };
        }
        catch (error) {
            return {
                row: index + 1,
                status: "REJECTED",
                code: error instanceof Error ? error.message : "UNKNOWN_ERROR",
            };
        }
    }
    validateRecord(dataType, record) {
        if (dataType === "SSI")
            this.ssi.validate(record);
        else if (dataType === "RMA")
            this.rma.validateCommand(record);
        else
            this.nostro.validateCommand(record);
    }
    createRecord(dataType, record) {
        if (dataType === "SSI")
            return this.ssi.create(record);
        if (dataType === "RMA")
            return this.rma.create(record);
        return this.nostro.create(record);
    }
    importResponse(request, checksum, results) {
        return {
            dataType: request.dataType,
            fileName: request.fileName,
            dryRun: Boolean(request.dryRun),
            checksum,
            total: results.length,
            accepted: results.filter((r) => r.status !== "REJECTED").length,
            rejected: results.filter((r) => r.status === "REJECTED").length,
            results,
        };
    }
};
exports.SwiftDataImportService = SwiftDataImportService;
exports.SwiftDataImportService = SwiftDataImportService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [ssi_application_service_1.SsiApplicationService,
        rma_application_service_1.RmaApplicationService,
        nostro_application_service_1.NostroApplicationService])
], SwiftDataImportService);
//# sourceMappingURL=swift-data-import.service.js.map