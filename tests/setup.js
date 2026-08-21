import { beforeEach, vi } from "vitest";

const PREFIX = "wb_agent_";

function clearWbStorage() {
  if (typeof localStorage === "undefined") return;
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  });
}

beforeEach(() => {
  clearWbStorage();
  vi.unstubAllGlobals();
});

export function resetApp() {
  clearWbStorage();
  vi.unstubAllGlobals();
}