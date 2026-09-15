"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRuntimeEnvironment = void 0;
const resolveRuntimeEnvironment = (environment = process.env) => {
    const explicit = environment["SSI_RUNTIME_ENV"];
    const value = explicit === undefined ? environment["NODE_ENV"] : explicit;
    const runtimeEnvironment = (value ?? "production").trim().toLowerCase();
    return {
        runtimeEnvironment: runtimeEnvironment || "unknown",
        developmentEnabled: ["demo", "development"].includes(runtimeEnvironment),
    };
};
exports.resolveRuntimeEnvironment = resolveRuntimeEnvironment;
//# sourceMappingURL=runtime-environment.policy.js.map