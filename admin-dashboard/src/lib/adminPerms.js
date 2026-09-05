import { useEffect, useState } from 'react';
import { apiFetch } from './api';

// Fetch the signed-in admin's sub-role + permission set once (GET /api/admin/me)
// and expose a `has(perm)` helper so pages/nav can show or hide controls by job.
// The result is cached module-wide for the session so every page doesn't refetch.
let CACHE = null; // { admin_role, permissions: [...] }
let INFLIGHT = null;

async function fetchPerms() {
  if (CACHE) return CACHE;
  if (!INFLIGHT) {
    INFLIGHT = apiFetch('/api/admin/me')
      .then((r) => { CACHE = { admin_role: r.admin_role || null, permissions: r.permissions || [] }; return CACHE; })
      .catch(() => { CACHE = { admin_role: null, permissions: [] }; return CACHE; })
      .finally(() => { INFLIGHT = null; });
  }
  return INFLIGHT;
}

// Drop the cache (e.g. on logout) so the next admin doesn't inherit it.
export function clearPermsCache() { CACHE = null; INFLIGHT = null; }

// Hook: { ready, adminRole, permissions, has(perm) }. Pass enabled=false to skip
// the fetch entirely (e.g. for a non-admin viewer) so no 403 request is made.
export function usePermissions(enabled = true) {
  const [state, setState] = useState(CACHE);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    fetchPerms().then((p) => { if (alive) setState(p); });
    return () => { alive = false; };
  }, [enabled]);
  const permissions = (state && state.permissions) || [];
  return {
    ready: !!state,
    adminRole: state ? state.admin_role : null,
    permissions,
    has: (perm) => permissions.includes(perm),
  };
}
