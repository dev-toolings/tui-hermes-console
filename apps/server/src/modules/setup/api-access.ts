const SETUP_API_PATHS = new Set([
  "/api/setup",
  "/api/runtime",
  "/api/runtime/test",
  "/api/agents",
]);

const SETUP_RUNTIME_ROUTE_ROOTS = [
  "/api/runtime/update",
  "/api/runtime/workspace",
  "/api/runtime/ssh/workspace",
] as const;

/**
 * Runtime operations required by the setup remain reachable while it is
 * incomplete. Authentication, same-origin/CSRF checks and installation
 * authorization still run normally.
 */
export function isApiAvailableDuringSetup(path: string) {
  return (
    SETUP_API_PATHS.has(path) ||
    SETUP_RUNTIME_ROUTE_ROOTS.some(
      (root) => path === root || path.startsWith(`${root}/`),
    )
  );
}
