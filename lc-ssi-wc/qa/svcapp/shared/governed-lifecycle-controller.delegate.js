"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernedLifecycleControllerDelegate = void 0;
const common_1 = require("@nestjs/common");
function governedLifecycleAction(action) {
    const normalized = action.toUpperCase();
    if (!["SUBMIT", "APPROVE", "ACTIVATE"].includes(normalized))
        throw new common_1.BadRequestException("INVALID_ACTION");
    return normalized;
}
class GovernedLifecycleControllerDelegate {
    service;
    constructor(service) {
        this.service = service;
    }
    list() {
        return this.service.list();
    }
    create(command) {
        return this.service.create(command);
    }
    update(id, command) {
        return this.service.update(id, command);
    }
    revise(id, maker) {
        return this.service.revise(id, maker);
    }
    transition(id, action, actor) {
        return this.service.transition(id, governedLifecycleAction(action), actor);
    }
    revoke(id, actor, reason) {
        return this.service.revoke(id, actor, reason);
    }
    audit() {
        return this.service.audit();
    }
}
exports.GovernedLifecycleControllerDelegate = GovernedLifecycleControllerDelegate;
//# sourceMappingURL=governed-lifecycle-controller.delegate.js.map