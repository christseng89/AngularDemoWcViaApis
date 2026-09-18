import { DOCUMENT } from "@angular/common";
import { Injectable, inject, signal } from "@angular/core";
import { activeTheme } from "./app-presentation";
import type { ThemeMode } from "./app-view.models";

@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<ThemeMode>("system");

  constructor() {
    const saved = this.document.defaultView?.localStorage.getItem("ssi-theme");
    const mode: ThemeMode =
      saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "system";
    this.setTheme(mode);
    this.document.defaultView
      ?.matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (this.theme() === "system") this.applyTheme("system");
      });
  }

  setTheme(mode: ThemeMode): void {
    this.theme.set(mode);
    this.document.defaultView?.localStorage.setItem("ssi-theme", mode);
    this.applyTheme(mode);
  }

  private applyTheme(mode: ThemeMode): void {
    const prefersDark =
      this.document.defaultView?.matchMedia("(prefers-color-scheme: dark)")
        .matches ?? false;
    this.document.documentElement.dataset["theme"] = activeTheme(
      mode,
      prefersDark,
    );
  }
}
