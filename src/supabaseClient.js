import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://kofgxwcnkapibioedhrh.supabase.co';
export const SUPABASE_PUBLIC_KEY = 'https://kofgxwcnkapibioedhrh.supabase.co/rest/v1/';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9FMsfEEp5dQd4f2vHt1u3A_amL3CsqM';
export const SUPABASE_STORAGE_BUCKET = 'app-files';
export const PUBLIC_LIVE_DB_STORAGE_URL =
  'https://kofgxwcnkapibioedhrh.supabase.co/storage/v1/object/public/app-files/one-msu-live-db.json';
export const BACKEND_API_ORIGINS = [
  '',
  'https://ais-pre-jvczvc3zf5s4xavwr2wjxh-24974164073.asia-southeast1.run.app',
  'https://ais-dev-jvczvc3zf5s4xavwr2wjxh-24974164073.asia-southeast1.run.app',
];

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// If this window was opened as an OAuth popup from inside the preview iframe,
// notify the opener window as soon as the Supabase session is established and close the popup.
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
      try {
        const bc = new BroadcastChannel('one_msu_supabase_auth');
        bc.postMessage({ type: 'SUPABASE_AUTH_SESSION', session });
        bc.close();
      } catch {
        // Ignore if BroadcastChannel is unsupported
      }
      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage({ type: 'SUPABASE_AUTH_SESSION', session }, '*');
          setTimeout(() => {
            window.close();
          }, 350);
        } catch {
          // Ignore cross-origin opener errors
        }
      }
    }
  });
}

/**
 * Initiates Google OAuth authentication using Supabase as the primary login system.
 * Handles both standalone browser tabs and iframe preview environments.
 */
export const signInWithGoogle = async () => {
  const inIframe = (() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const isMobileBrowser =
    !inIframe &&
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || ''
    );

  // Open popup synchronously on user gesture for desktop/iframe contexts so browsers never block it
  const authPopup = !isMobileBrowser
    ? window.open(
        'about:blank',
        'one_msu_google_oauth',
        'width=520,height=680,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes'
      )
    : null;

  if (authPopup) {
    try {
      authPopup.document.write(
        '<!doctype html><html><head><title>Signing in with Google - ONE</title></head><body style="margin:0;font-family:system-ui,sans-serif;background:#FAF8F5;color:#7B1113;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;"><div style="width:48px;height:48px;border-radius:14px;background:#7B1113;border:2px solid #D4AF37;color:#D4AF37;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;margin-bottom:12px;">ONE</div><div style="font-weight:600;font-size:15px;">Connecting to Google Sign-In...</div></body></html>'
      );
    } catch {
      // Ignore cross-origin document write errors
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline',
        },
      },
    });

    if (error) {
      if (!authPopup.closed) authPopup.close();
      throw error;
    }

    if (data?.url) {
      authPopup.location.replace(data.url);
    }

    return await new Promise((resolve) => {
      let settled = false;
      let pollTimer = null;
      let bc = null;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (bc) {
          try {
            bc.close();
          } catch {
            // ignore
          }
        }
        window.removeEventListener('message', onMsg);
        window.removeEventListener('storage', onStorage);
        resolve(result);
      };

      const checkSessionAndFinish = async () => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user) {
            if (!authPopup.closed) {
              try {
                authPopup.close();
              } catch {
                // ignore
              }
            }
            finish({ data: { ...data, session, user: session.user }, session, user: session.user });
            return true;
          }
        } catch {
          // ignore
        }
        return false;
      };

      const onMsg = (ev) => {
        if (ev?.data?.type === 'SUPABASE_AUTH_SESSION' && ev.data.session?.user) {
          if (!authPopup.closed) {
            try {
              authPopup.close();
            } catch {
              // ignore
            }
          }
          finish({
            data: { ...data, session: ev.data.session, user: ev.data.session.user },
            session: ev.data.session,
            user: ev.data.session.user,
          });
        }
      };

      const onStorage = () => {
        void checkSessionAndFinish();
      };

      window.addEventListener('message', onMsg);
      window.addEventListener('storage', onStorage);

      try {
        if (typeof BroadcastChannel !== 'undefined') {
          bc = new BroadcastChannel('one_msu_supabase_auth');
          bc.onmessage = (ev) => {
            if (ev?.data?.type === 'SUPABASE_AUTH_SESSION' && ev.data.session?.user) {
              onMsg(ev);
            }
          };
        }
      } catch {
        // ignore
      }

      pollTimer = setInterval(async () => {
        const found = await checkSessionAndFinish();
        if (found) return;
        if (authPopup.closed) {
          setTimeout(async () => {
            const finalFound = await checkSessionAndFinish();
            if (!finalFound) {
              finish({ data, cancelled: true });
            }
          }, 400);
        }
      }, 500);
    });
  }

  // Fallback for mobile browsers or when popups are blocked in top-level navigation
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      skipBrowserRedirect: inIframe,
      queryParams: {
        prompt: 'select_account',
        access_type: 'offline',
      },
    },
  });

  if (error) throw error;
  if (inIframe && data?.url) {
    window.open(data.url, '_blank');
  }
  return data;
};

/**
 * Signs out the current Supabase session.
 */
export const signOutWithSupabase = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

/**
 * Uploads a File or base64 Data URL to the Supabase Storage `app-files` bucket
 * via the server-side Supabase Storage endpoint (with direct client upload fallback)
 * and returns the permanent public URL.
 */
export const uploadFileToSupabaseStorage = async ({
  fileName,
  mimeType,
  base64DataUrl,
  folder = 'uploads',
}) => {
  for (const origin of BACKEND_API_ORIGINS) {
    try {
      const res = await fetch(`${origin}/api/storage/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          mimeType,
          base64Data: base64DataUrl,
          folder,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        if (json?.ok && json?.publicUrl) {
          return json.publicUrl;
        }
      }
    } catch {
      // Try next origin
    }
  }

  try {
    const commaIdx = base64DataUrl.indexOf(',');
    const rawBase64 = commaIdx !== -1 ? base64DataUrl.slice(commaIdx + 1) : base64DataUrl;
    const binary = atob(rawBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const safeName = String(fileName || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 100);
    const objectPath = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`;
    const { error } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(objectPath, bytes, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true,
      });
    if (!error) {
      const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(objectPath);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
    }
  } catch {
    // Return data URL fallback if offline
  }

  return base64DataUrl;
};

export default supabase;
