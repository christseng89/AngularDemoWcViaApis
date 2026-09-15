"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SampleImportService = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const message_mapping_service_1 = require("./message-mapping.service");
const ALLOWED_EXTENSIONS = new Set(['.ssi', '.json']);
const MAX_FILES = 100;
const MAX_BYTES = 64 * 1024;
let SampleImportService = class SampleImportService {
    mapping;
    constructor(mapping) {
        this.mapping = mapping;
    }
    list() {
        const root = this.root();
        const files = (0, node_fs_1.readdirSync)(root, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
            .map((entry) => (0, node_path_1.resolve)(entry.parentPath, entry.name))
            .filter((path) => ALLOWED_EXTENSIONS.has((0, node_path_1.extname)(path).toLowerCase()))
            .slice(0, MAX_FILES);
        return files.map((path) => {
            const stat = (0, node_fs_1.lstatSync)(path);
            return { path: (0, node_path_1.relative)(root, path).replaceAll('\\', '/'), format: (0, node_path_1.extname)(path).toLowerCase() === '.json' ? 'MX_JSON' : 'FIN_LIKE', bytes: stat.size };
        });
    }
    load(samplePath) {
        const path = this.safePath(samplePath);
        const stat = (0, node_fs_1.lstatSync)(path);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new common_1.BadRequestException('INVALID_SAMPLE_FILE');
        if (stat.size > MAX_BYTES)
            throw new common_1.BadRequestException('SAMPLE_FILE_TOO_LARGE');
        const format = (0, node_path_1.extname)(path).toLowerCase() === '.json' ? 'MX_JSON' : 'FIN_LIKE';
        const content = (0, node_fs_1.readFileSync)(path, 'utf8');
        return { sample: { path: samplePath.replaceAll('\\', '/'), format, bytes: stat.size }, content, extraction: this.mapping.extract(this.mapping.parse(content, format)) };
    }
    importDirectory() {
        const results = this.list().map((sample) => {
            try {
                return { status: 'IMPORTED', ...this.load(sample.path) };
            }
            catch (error) {
                return { status: 'FAILED', sample, error: error instanceof Error ? error.message : 'IMPORT_FAILED' };
            }
        });
        return { rootAlias: 'SAMPLE_ROOT', imported: results.filter((result) => result.status === 'IMPORTED').length, failed: results.filter((result) => result.status === 'FAILED').length, results };
    }
    root() { return (0, node_path_1.resolve)(process.env['SAMPLE_ROOT'] ?? (0, node_path_1.resolve)(process.cwd(), 'samples')); }
    safePath(samplePath) {
        if (!samplePath || !/^[a-zA-Z0-9._/-]+$/.test(samplePath))
            throw new common_1.BadRequestException('INVALID_SAMPLE_PATH');
        const root = this.root();
        const target = (0, node_path_1.resolve)(root, samplePath);
        if (!target.startsWith(`${root}${node_path_1.sep}`) || !ALLOWED_EXTENSIONS.has((0, node_path_1.extname)(target).toLowerCase()))
            throw new common_1.BadRequestException('SAMPLE_PATH_OUTSIDE_ROOT');
        try {
            (0, node_fs_1.lstatSync)(target);
        }
        catch {
            throw new common_1.NotFoundException('SAMPLE_NOT_FOUND');
        }
        return target;
    }
};
exports.SampleImportService = SampleImportService;
exports.SampleImportService = SampleImportService = tslib_1.__decorate([
    (0, common_1.Injectable)(),
    tslib_1.__metadata("design:paramtypes", [message_mapping_service_1.MessageMappingService])
], SampleImportService);
//# sourceMappingURL=sample-import.service.js.map