export function uid(): string {
  // Compact random ID — good enough for local persistence
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
