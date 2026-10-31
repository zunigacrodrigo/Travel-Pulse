import { describe, expect, it } from "vitest";
import { buildTripPlan } from "./engine";
import { DEMO_ACTIVITIES, DEMO_TRIP } from "./demo";
import { MAX_HISTORY, parseHistory, pushSnapshot, redo, undo, emptyHistory, type Snapshot } from "./history";

const NOW = "2026-10-27T15:00:00Z";

function snap(label: string, count = DEMO_ACTIVITIES.length): Snapshot {
  const activities = DEMO_ACTIVITIES.slice(0, count);
  return { label, at: NOW, trip: DEMO_TRIP, activities, plan: buildTripPlan(DEMO_TRIP, activities, { now: NOW }) };
}

describe("historial de Trip Twin", () => {
  it("undo devuelve la instantánea anterior y guarda la actual para rehacer", () => {
    const before = snap("antes", 2);
    const current = snap("ahora", 3);
    const h = pushSnapshot(emptyHistory(), before);
    const result = undo(h, current)!;
    expect(result.restored.activities).toHaveLength(2);
    expect(result.history.past).toHaveLength(0);
    expect(result.history.future).toHaveLength(1);
    expect(result.history.future[0]!.activities).toHaveLength(3);
  });

  it("redo revierte un undo", () => {
    const h = pushSnapshot(emptyHistory(), snap("antes", 2));
    const u = undo(h, snap("ahora", 3))!;
    const r = redo(u.history, u.restored)!;
    expect(r.restored.activities).toHaveLength(3);
    expect(r.history.past).toHaveLength(1);
    expect(r.history.future).toHaveLength(0);
  });

  it("un cambio nuevo descarta el futuro", () => {
    const h = pushSnapshot(emptyHistory(), snap("a", 2));
    const u = undo(h, snap("b", 3))!;
    expect(u.history.future).toHaveLength(1);
    expect(pushSnapshot(u.history, snap("c", 2)).future).toHaveLength(0);
  });

  it("sin pasado o sin futuro devuelve null", () => {
    expect(undo(emptyHistory(), snap("x"))).toBeNull();
    expect(redo(emptyHistory(), snap("x"))).toBeNull();
  });

  it("limita el tamaño conservando lo más reciente", () => {
    let h = emptyHistory();
    for (let i = 0; i < MAX_HISTORY + 5; i++) h = pushSnapshot(h, snap(`c${i}`, 1));
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past.at(-1)!.label).toBe(`c${MAX_HISTORY + 4}`);
  });

  it("parseHistory acepta lo que serializa y descarta basura", () => {
    const h = pushSnapshot(emptyHistory(), snap("ok"));
    expect(parseHistory(JSON.parse(JSON.stringify(h))).past).toHaveLength(1);
    expect(parseHistory({ past: [{ label: 1 }], future: "x" })).toEqual(emptyHistory());
    expect(parseHistory(null)).toEqual(emptyHistory());
    expect(parseHistory("texto")).toEqual(emptyHistory());
  });
});
