# Balance Component Web Component Phase 4

Phase 4 adds framework adapters without creating new business implementations.

- Angular: standalone typed wrapper.
- React: runtime-injected typed factory and imperative handle.
- Vue: lifecycle binding and `isCustomElement` compiler predicate.
- Shared adapter core: config property assignment, typed events, Promise method forwarding and cleanup.

The native version 1 Web Component contract remains authoritative. Backend, OAS, authentication,
Balance rules, Shadow DOM, lazy loading and theme-token behavior are unchanged.
