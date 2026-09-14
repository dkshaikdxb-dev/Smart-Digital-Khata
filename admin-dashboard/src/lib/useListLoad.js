import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetchMeta } from './api';
import { logForSupport } from './errorText';

// The owner list screens each rolled their own fetch: a bare `load()` whose
// rejection went to `setError(e.message)`, with NO loading flag at all. So a
// request that timed out on 2G left the screen in exactly the state an empty
// shop produces — "No customers yet" — and a shopkeeper was told, in effect,
// that nobody owes them money.
//
// This is the small shared piece those screens were missing. It owns only the
// three things they all got wrong (are we still asking, did it fail, was the
// answer live) and leaves each screen its own data state, so adopting it is a
// few lines per page rather than a rewrite.
//
// The loader is handed a `load(path)` that returns the parsed body and quietly
// records whether the service worker answered from this phone's cache, so the
// screen can label money that is not live. `fresh` (the Refresh button) sends
// `cache: 'reload'`, which the service worker honours by going to the network
// first.

export function useListLoad(loader, deps = []) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ok'
  const [error, setError] = useState(null);
  const [cache, setCache] = useState({ fromCache: false, cachedAt: null });

  // Only the newest run may write state: on a slow link an earlier response can
  // still land after a newer one, and letting it through would resurrect a
  // stale list — or a stale error over a good load.
  const runIdRef = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async ({ fresh = false } = {}) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setStatus('loading');
    setError(null);

    // The oldest copy seen in this run decides what the notice says: if any part
    // of the screen came off the cache, the screen is not fully live.
    let meta = { fromCache: false, cachedAt: null };
    const load = async (path, options = {}) => {
      const opts = fresh ? { ...options, cache: 'reload' } : options;
      const r = await apiFetchMeta(path, opts);
      if (r.fromCache) {
        meta = {
          fromCache: true,
          cachedAt: meta.cachedAt == null ? r.cachedAt : Math.min(meta.cachedAt, r.cachedAt ?? meta.cachedAt),
        };
      }
      return r.data;
    };

    try {
      await loaderRef.current({ load, fresh });
      if (runIdRef.current !== runId) return;
      setCache(meta);
      setStatus('ok');
    } catch (err) {
      if (runIdRef.current !== runId) return;
      // Off the screen, but not out of the world: support still needs it.
      logForSupport(err, 'list load failed');
      setError(err);
      setStatus('error');
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { run(); }, [run]);

  const reload = useCallback(() => run(), [run]);
  const refresh = useCallback(() => run({ fresh: true }), [run]);

  return {
    status,
    loading: status === 'loading',
    failed: status === 'error',
    error,
    fromCache: cache.fromCache,
    cachedAt: cache.cachedAt,
    reload,
    refresh,
  };
}

export default useListLoad;
