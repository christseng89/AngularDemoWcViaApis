# Web Component Phase 4 — Framework Adapters

## Scope

Phase 4 adds thin Angular, React and Vue integration layers around the version 1
`<balance-component-app>` contract. The adapters assign `config` as a DOM property,
forward the Promise-returning `navigate` and `refresh` methods, and map the four
typed Custom Events. They contain no Balance rules, HTTP calls or copied UI.

## Dependency boundary

- Angular ships a standalone wrapper because Angular is already a project runtime.
- React is exposed as a runtime-injected factory, so React is not bundled into the core WC.
- Vue uses a lifecycle binding plus `isCustomElement` compiler configuration, so Vue is not bundled.
- Every mounted adapter owns and removes only its own event listeners.

## Acceptance

- Config is assigned as a property, never serialized to an attribute.
- `navigate` and `refresh` preserve their Promise contract.
- ready, navigation, refresh and error events retain their typed `CustomEvent.detail`.
- unmount cleanup and multiple-instance isolation are tested.
- Core WC lazy loading, Shadow DOM and theme tokens remain unchanged.
