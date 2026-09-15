"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLEARING_SYSTEMS = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
exports.CLEARING_SYSTEMS = Object.freeze(JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.resolve)(process.cwd(), "parameters", "clearing-systems.json"), "utf8")));
//# sourceMappingURL=clearing-systems.reference.js.map