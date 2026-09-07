import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

// Public blog post (Batch T) — served at /blog/<slug>. Renders the post title,
// date, and body. The body is rendered as SAFE text/paragraphs — split on blank
// lines into <p> blocks with React's default text escaping. There is NO
// dangerouslySetInnerHTML anywhere, so post content can never inject markup.
// Client-fetches the public API (no SSR dependency), matching the landing.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (_) {
    return '';
  }
}

// Split a plain-text body into paragraphs on blank lines; within a paragraph,
// single newlines become <br/>. All text is escaped by React.
function paragraphs(body) {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function BlogPost() {
  const router = useRouter();
  const { slug } = router.query;
  const [state, setState] = useState({ status: 'loading', post: null }); // loading | ok | notfound | error

  useEffect(() => {
    if (!slug) return undefined; // slug not hydrated yet
    let cancelled = false;
    setState({ status: 'loading', post: null });
    fetch(`${API_BASE}/api/public/blog/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (r.status === 404) return { _notfound: true };
        if (!r.ok) return Promise.reject(new Error('load failed'));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        if (d && d._notfound) setState({ status: 'notfound', post: null });
        else setState({ status: 'ok', post: d.post });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error', post: null }); });
    return () => { cancelled = true; };
  }, [slug]);

  const post = state.post;
  const title = post ? post.title : (state.status === 'notfound' ? 'Post not found' : 'Blog');

  return (
    <>
      <Head>
        <title>{title} — Smart Digital Khata</title>
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
            <Link href="/blog" className="btn btn-ghost">All posts</Link>
            <a href="/register" className="btn btn-green">Start free</a>
          </div>
        </nav>
      </header>

      <main className="wrap">
        {state.status === 'loading' && <p className="muted pad">Loading…</p>}

        {state.status === 'notfound' && (
          <section className="pad">
            <h1>Post not found</h1>
            <p className="muted">This post may have been moved or unpublished.</p>
            <p><Link className="link" href="/blog">← Back to all posts</Link></p>
          </section>
        )}

        {state.status === 'error' && (
          <section className="pad">
            <h1>Something went wrong</h1>
            <p className="muted">Could not load this post right now. Please try again later.</p>
            <p><Link className="link" href="/blog">← Back to all posts</Link></p>
          </section>
        )}

        {state.status === 'ok' && post && (
          <article className="post">
            <p className="crumb"><Link className="link" href="/blog">← All posts</Link></p>
            <span className="date">{fmtDate(post.published_at)}</span>
            <h1>{post.title}</h1>
            <div className="body">
              {paragraphs(post.body).map((para, i) => (
                <p key={i}>
                  {para.split('\n').map((line, j, arr) => (
                    <span key={j}>{line}{j < arr.length - 1 ? <br /> : null}</span>
                  ))}
                </p>
              ))}
            </div>
          </article>
        )}
      </main>

      <footer className="wrap">
        <div className="foot">
          <Link href="/" className="brand"><span className="mark">ख</span> Smart Digital Khata</Link>
          <div>© Smart Digital Khata</div>
        </div>
      </footer>

      <style jsx global>{`
        :root{
          --paper:#F7F0E1; --card:#FFFDF7; --ink:#2A1E12; --ink-soft:#6B5A45;
          --line:#E0D3B8; --green:#1C7A45; --green-deep:#125832;
          --shadow:0 1px 2px rgba(42,30,18,.06),0 18px 40px -20px rgba(42,30,18,.28);
          --maxw:760px; --disp:'Fraunces',Georgia,serif; --sans:'Mukta','Segoe UI',system-ui,sans-serif;
        }
        @media (prefers-color-scheme:dark){
          :root:not([data-theme="light"]){
            --paper:#14100A; --card:#201A11; --ink:#F1E9D8; --ink-soft:#B6A588;
            --line:#332A1D; --green:#3FB56E; --green-deep:#8FE0AC;
            --shadow:0 1px 2px rgba(0,0,0,.5),0 22px 50px -22px rgba(0,0,0,.7);
          }
        }
        :root[data-theme="dark"]{
          --paper:#14100A; --card:#201A11; --ink:#F1E9D8; --ink-soft:#B6A588;
          --line:#332A1D; --green:#3FB56E; --green-deep:#8FE0AC;
          --shadow:0 1px 2px rgba(0,0,0,.5),0 22px 50px -22px rgba(0,0,0,.7);
        }
        *{box-sizing:border-box}
        body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.7;-webkit-font-smoothing:antialiased}
        a{color:inherit;text-decoration:none}
        .wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
        .pad{padding:52px 0}
        .muted{color:var(--ink-soft)}
        .link{color:var(--green-deep);font-weight:600}
        header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
        .nav{display:flex;align-items:center;justify-content:space-between;padding:12px 22px;max-width:var(--maxw);margin:0 auto;gap:14px}
        .brand{display:flex;align-items:center;gap:10px;font-family:var(--disp);font-weight:700;font-size:1.12rem}
        .mark{width:30px;height:30px;border-radius:8px;background:linear-gradient(150deg,var(--green),var(--green-deep));display:grid;place-items:center;color:#fff;font-family:var(--disp);font-weight:700;font-size:1rem;box-shadow:var(--shadow)}
        .nav-cta{display:flex;gap:8px;align-items:center}
        .btn{font-family:var(--sans);font-weight:700;font-size:.9rem;border-radius:999px;padding:9px 15px;border:1px solid transparent;cursor:pointer;display:inline-flex;gap:8px;align-items:center}
        .btn-green{background:var(--green);color:#fff}
        .btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
        .post{padding:44px 0 20px}
        .crumb{margin:0 0 18px}
        .date{font-size:.82rem;color:var(--ink-soft)}
        h1{font-family:var(--disp);font-weight:600;font-size:clamp(2rem,4.6vw,2.8rem);margin:8px 0 18px;line-height:1.12;letter-spacing:-.005em}
        .body p{margin:0 0 18px;font-size:1.08rem}
        footer{padding:34px 0 60px;color:var(--ink-soft);font-size:.86rem;border-top:1px solid var(--line);margin-top:20px}
        .foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}
      `}</style>
    </>
  );
}
