type TestSignal<T> = (() => T) & { set(value: T): void };

function testSignal<T>(initial: T): TestSignal<T> {
  let current = initial;
  const read = (() => current) as TestSignal<T>;
  read.set = (value) => {
    current = value;
  };
  return read;
}

const documentToken = Symbol("DOCUMENT");
let prefersDark = false;
let mediaChangeListener: (() => void) | undefined;
let fakeDocument: {
  defaultView: {
    localStorage: {
      getItem: jest.Mock<string | null, [string]>;
      setItem: jest.Mock<void, [string, string]>;
    };
    matchMedia: jest.Mock;
  } | null;
  documentElement: { dataset: Record<string, string> };
};

const createDocument = (saved: string | null) => ({
  defaultView: {
    localStorage: {
      getItem: jest.fn(() => saved),
      setItem: jest.fn(),
    },
    matchMedia: jest.fn(() => ({
      get matches() {
        return prefersDark;
      },
      addEventListener: jest.fn(
        (_event: string, listener: () => void) =>
          (mediaChangeListener = listener),
      ),
    })),
  },
  documentElement: { dataset: {} as Record<string, string> },
});

jest.doMock("@angular/core", () => ({
  Injectable:
    () =>
    <Target>(target: Target): Target =>
      target,
  inject: (token: unknown) => {
    if (token === documentToken) return fakeDocument;
    throw new Error("Unexpected injection token");
  },
  signal: testSignal,
}));

jest.doMock("@angular/common", () => ({ DOCUMENT: documentToken }));

describe("ThemeService", () => {
  beforeEach(() => {
    prefersDark = false;
    mediaChangeListener = undefined;
    fakeDocument = createDocument(null);
  });

  it.each(["light", "dark", "system"] as const)(
    "restores, persists, and applies the saved %s mode",
    async (mode) => {
      prefersDark = mode === "system";
      fakeDocument = createDocument(mode);
      const { ThemeService } = await import("./theme.service");

      const service = new ThemeService();

      expect(service.theme()).toBe(mode);
      expect(
        fakeDocument.defaultView?.localStorage.setItem,
      ).toHaveBeenCalledWith("ssi-theme", mode);
      expect(fakeDocument.documentElement.dataset["theme"]).toBe(
        mode === "system" ? "dark" : mode,
      );
      expect(mediaChangeListener).toBeDefined();
    },
  );

  it("falls back to system for missing or invalid saved values", async () => {
    prefersDark = true;
    fakeDocument = createDocument("unsupported");
    const { ThemeService } = await import("./theme.service");

    const service = new ThemeService();

    expect(service.theme()).toBe("system");
    expect(fakeDocument.defaultView?.localStorage.setItem).toHaveBeenCalledWith(
      "ssi-theme",
      "system",
    );
    expect(fakeDocument.documentElement.dataset["theme"]).toBe("dark");
  });

  it("persists and applies an explicit theme selection", async () => {
    const { ThemeService } = await import("./theme.service");
    const service = new ThemeService();

    service.setTheme("dark");

    expect(service.theme()).toBe("dark");
    expect(
      fakeDocument.defaultView?.localStorage.setItem,
    ).toHaveBeenLastCalledWith("ssi-theme", "dark");
    expect(fakeDocument.documentElement.dataset["theme"]).toBe("dark");
  });

  it("reacts to system color changes only while system mode is selected", async () => {
    const { ThemeService } = await import("./theme.service");
    const service = new ThemeService();
    expect(fakeDocument.documentElement.dataset["theme"]).toBe("light");

    prefersDark = true;
    mediaChangeListener?.();
    expect(fakeDocument.documentElement.dataset["theme"]).toBe("dark");

    service.setTheme("light");
    mediaChangeListener?.();
    expect(fakeDocument.documentElement.dataset["theme"]).toBe("light");
  });

  it("uses the light system fallback when a browser window is unavailable", async () => {
    fakeDocument = {
      defaultView: null,
      documentElement: { dataset: {} },
    };
    const { ThemeService } = await import("./theme.service");

    const service = new ThemeService();

    expect(service.theme()).toBe("system");
    expect(fakeDocument.documentElement.dataset["theme"]).toBe("light");
  });
});
