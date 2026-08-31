// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpen, Home, TrendingUp } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppNav, type AppNavItem } from "./AppNav.js";

function items(overrides: Partial<Record<string, Partial<AppNavItem>>> = {}): AppNavItem[] {
  const base: AppNavItem[] = [
    { key: "today", label: "Aujourd'hui", icon: Home, active: false, onClick: () => undefined },
    { key: "documents", label: "Mes cours", icon: BookOpen, active: false, onClick: () => undefined },
    { key: "progress", label: "Progression", icon: TrendingUp, active: false, onClick: () => undefined },
  ];
  return base.map((item) => ({ ...item, ...overrides[item.key] }));
}

describe("AppNav", () => {
  afterEach(() => cleanup());

  it("renders one button per item, as a single nav landmark (not one tree per breakpoint)", () => {
    render(<AppNav items={items()} />);

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Aujourd'hui" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mes cours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Progression" })).toBeInTheDocument();
  });

  it("marks the active item with aria-current, and only that one", () => {
    render(<AppNav items={items({ documents: { active: true } })} />);

    expect(screen.getByRole("button", { name: "Mes cours" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Aujourd'hui" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Progression" })).not.toHaveAttribute("aria-current");
  });

  it("clicking an item calls its own onClick, and only its own", async () => {
    const onToday = vi.fn();
    const onDocuments = vi.fn();
    const user = userEvent.setup();
    render(<AppNav items={items({ today: { onClick: onToday }, documents: { onClick: onDocuments } })} />);

    await user.click(screen.getByRole("button", { name: "Mes cours" }));

    expect(onDocuments).toHaveBeenCalledTimes(1);
    expect(onToday).not.toHaveBeenCalled();
  });

  it("each destination pairs a decorative icon with its own label — the accessible name stays exactly the label, unaffected by the icon (docs/UI.md's Icons note)", () => {
    render(<AppNav items={items()} />);

    for (const label of ["Aujourd'hui", "Mes cours", "Progression"]) {
      const button = screen.getByRole("button", { name: label });
      const icon = button.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveAttribute("focusable", "false");
    }
  });

  it("is fixed to the viewport on desktop too, not just mobile — a long page must not carry it away while scrolling (the bug this fixed: md:static previously put it back in normal flow)", () => {
    render(<AppNav items={items()} />);

    const nav = screen.getByRole("navigation");
    expect(nav.className).not.toMatch(/md:static/);
    expect(nav.className).toMatch(/md:fixed/);
    expect(nav.className).toMatch(/md:inset-y-0/);
    expect(nav.className).toMatch(/md:left-0/);
  });

  it("stays clickable while dimmed: a focused session must never trap the student behind an unusable nav", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<AppNav items={items({ today: { onClick } })} dimmed />);

    await user.click(screen.getByRole("button", { name: "Aujourd'hui" }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Aujourd'hui" })).not.toBeDisabled();
  });
});
