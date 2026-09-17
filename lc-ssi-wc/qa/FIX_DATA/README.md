# FIX_DATA QA Packages

Controlled repair and reload packages are separated by domain:

- [`rma/`](rma/) — the existing governed RMA repair and Reload Test Data package.
- [`ssi/`](ssi/) — the current SSI ACTIVE-data remediation package.
- [`src/`](src/) — shared OO TypeScript contracts and infrastructure.
- [`src/rma/`](src/rma/) — parameter-driven RMA policies and adapters.
- [`src/ssi/`](src/ssi/) — parameter-driven SSI policies and adapters.

Do not place new domain artifacts directly in this directory. Each package owns
its specifications, manifests, dry-run evidence and implementation under its
domain folder. Executable TypeScript belongs under `src/`, not under a data
package.
