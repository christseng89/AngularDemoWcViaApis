import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
} from "@angular/router";

export interface RouterEventHandlers {
  start(event: NavigationStart): void;
  end(event: NavigationEnd): void;
  skipped(event: NavigationSkipped): void;
  failure(event: NavigationCancel | NavigationError): void;
}

export const dispatchRouterEvent = (
  event: unknown,
  handlers: RouterEventHandlers,
): void => {
  if (event instanceof NavigationStart) {
    handlers.start(event);
    return;
  }
  if (event instanceof NavigationEnd) {
    handlers.end(event);
    return;
  }
  if (event instanceof NavigationSkipped) {
    handlers.skipped(event);
    return;
  }
  if (event instanceof NavigationCancel || event instanceof NavigationError) {
    handlers.failure(event);
  }
};
