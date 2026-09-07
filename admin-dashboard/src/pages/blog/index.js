import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

// Public blog index (Batch T) — served at /blog on the marketing site. Lists the
// most recent published posts, newest first, each linking to /blog/<slug>.
// Client-fetches the public API the same way the landing fetches /api/public/config
// (no auth, no SSR dependency), so `next build` never needs the API up.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (_) {
    return '';
  }
}

export default function BlogIndex() {
  const [posts, setPosts] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/public/blog?limit=50`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => { if (!cancelled) setPosts(Array.isArray(d.posts) ? d.posts : []); })
      .catch(() => { if (!cancelled) { setPosts([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Head>
        <title>Blog — Smart Digital Khata</title>
        <meta name="description" content="Stories, tips and updates from Smart Digital Khata — the digital khata for every shop." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Mukta:wght@400;500;600;700&display=swap"
        />
      </Head>

      <header>
        <nav className="nav">
          <Link href="/" className="brand"><span className="mark">ख</span> Smart Digital Khata</Link>
          <div className="nav-cta">
            <Link href="/" className="btn btn-ghost">Home</Link>
            <a href="/register" className="btn btn-green">Start free</a>
          </div>
        </nav>
      </header>

      <main className="wrap">
        <section className="head">
          <span className="eyebrow">From the shop counter</span>
          <h1>Blog</h1>
          <p className="lede">Stories, tips and updates from Smart Digital Khata.</p>
        </section>

        <section className="list">
          {posts === null && <p className="muted">Loading…</p>}
          {posts !== null && posts.length === 0 && (
            <p className="muted">{failed ? 'Could not load posts right now. Please try again later.' : 'No posts yet — check back soon.'}</p>
          )}
          {posts !== null && posts.length > 0 && (
            <ul className="cards">
              {posts.map((p) => (
                <li key={p.slug} className="card">
                  <Link href={`/blog/${encodeURIComponent(p.slug)}`} className="cardlink">
                    <span className="date">{fmtDate(p.published_at)}</span>
                    <span className="title">{p.title}</span>
                    <span className="more">Read post →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="wrap">
        <div className="foot">
          <Link href="/" className="brand"><span className="mark">ख</span> Smart Digital Khata</Link>
          <div>हर दुकान, अब डिजिटल · Every shop, now digital</div>
          <div>© Smart Digital Khata</div>
        </div>
      </footer>

      <style jsx global>{`
        :root{
          --paper:#F7F0E1; --card:#FFFDF7; --ink:#2A1E12; --ink-soft:#6B5A45;
          --line:#E0D3B8; --green:#1C7A45; --green-deep:#125832; --haldi:#E39B24;
          --shadow:0 1px 2px rgba(42,30,18,.06),0 18px 40px -20px rgba(42,30,18,.28);
          --radius:16px; --maxw:820px;
          --disp:'Fraunces',Georgia,serif; --sans:'Mukta','Segoe UI',system-ui,sans-serif;
        }
        @media (prefers-color-scheme:dark){
          :root:not([data-theme="light"]){
            --paper:#14100A; --card:#201A11; --ink:#F1E9D8; --ink-soft:#B6A588;
            --line:#332A1D; --green:#3FB56E; --green-deep:#8FE0AC; --haldi:#F0B24C;
            --shadow:0 1px 2px rgba(0,0,0,.5),0 22px 50px -22px rgba(0,0,0,.7);
          }
        }
        :root[data-theme="dark"]{
          --paper:#14100A; --card:#201A11; --ink:#F1E9D8; --ink-soft:#B6A588;
          --line:#332A1D; --green:#3FB56E; --green-deep:#8FE0AC; --haldi:#F0B24C;
          --shadow:0 1px 2px rgba(0,0,0,.5),0 22px 50px -22px rgba(0,0,0,.7);
        }
        *{box-sizing:border-box}
        body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased}
        a{color:inherit;text-decoration:none}
        .wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
        .eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--green-deep)}
        header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
        .nav{display:flex;align-items:center;justify-content:space-between;padding:12px 22px;max-width:var(--maxw);margin:0 auto;gap:14px}
        .brand{display:flex;align-items:center;gap:10px;font-family:var(--disp);font-weight:700;font-size:1.12rem}
        .mark{width:30px;height:30px;border-radius:8px;background:linear-gradient(150deg,var(--green),var(--green-deep));display:grid;place-items:center;color:#fff;font-family:var(--disp);font-weight:700;font-size:1rem;box-shadow:var(--shadow)}
        .nav-cta{display:flex;gap:8px;align-items:center}
        .btn{font-family:var(--sans);font-weight:700;font-size:.9rem;border-radius:999px;padding:9px 15px;border:1px solid transparent;cursor:pointer;display:inline-flex;gap:8px;align-items:center}
        .btn-green{background:var(--green);color:#fff}
        .btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
        .head{padding:52px 0 20px}
        h1{font-family:var(--disp);font-weight:600;font-size:clamp(2.1rem,5vw,3rem);margin:8px 0 0;letter-spacing:-.005em}
        .lede{color:var(--ink-soft);font-size:1.08rem;margin-top:10px}
        .muted{color:var(--ink-soft)}
        .list{padding:12px 0 40px}
        .cards{list-style:none;margin:0;padding:0;display:grid;gap:14px}
        .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
        .cardlink{display:flex;flex-direction:column;gap:6px;padding:20px 22px}
        .card .date{font-size:.8rem;color:var(--ink-soft)}
        .card .title{font-family:var(--disp);font-weight:600;font-size:1.35rem;line-height:1.2}
        .card .more{font-size:.85rem;color:var(--green-deep);font-weight:600;margin-top:4px}
        footer{padding:34px 0 60px;color:var(--ink-soft);font-size:.86rem;border-top:1px solid var(--line);margin-top:20px}
        .foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}
        @media(max-width:600px){.foot{flex-direction:column;align-items:flex-start}}
      `}</style>
    </>
  );
}
