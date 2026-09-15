"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageController = void 0;
const tslib_1 = require("tslib");
const common_1 = require("@nestjs/common");
const message_mapping_service_1 = require("./message-mapping.service");
let MessageController = class MessageController {
    service;
    constructor(service) {
        this.service = service;
    }
    extract(body) { return this.service.extract(this.service.parse(body.content, body.format)); }
    generate(body) { return this.service.generate(body.message, body.roles); }
};
exports.MessageController = MessageController;
tslib_1.__decorate([
    (0, common_1.Post)('extract'),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], MessageController.prototype, "extract", null);
tslib_1.__decorate([
    (0, common_1.Post)('generate'),
    tslib_1.__param(0, (0, common_1.Body)()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [Object]),
    tslib_1.__metadata("design:returntype", Object)
], MessageController.prototype, "generate", null);
exports.MessageController = MessageController = tslib_1.__decorate([
    (0, common_1.Controller)('messages'),
    tslib_1.__metadata("design:paramtypes", [message_mapping_service_1.MessageMappingService])
], MessageController);
//# sourceMappingURL=message.controller.js.map