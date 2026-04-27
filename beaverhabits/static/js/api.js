// Tiny fetch wrapper. Sends Authorization: Bearer <jwt> from localStorage.
// On 401, clears the token and redirects to /login (unless already there).

const PUBLIC_PATHS = ['/login'];

function getToken() {
    return localStorage.getItem('jwt');
}

function clearTokenAndRedirect() {
    localStorage.removeItem('jwt');
    if (!PUBLIC_PATHS.includes(window.location.pathname)) {
        window.location.href = '/login';
    }
}

async function _fetch(method, path, opts = {}) {
    const init = { method, headers: {} };
    const token = getToken();
    if (token) init.headers['Authorization'] = `Bearer ${token}`;

    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
    } else if (opts.body instanceof FormData) {
        init.body = opts.body;
    }

    const resp = await fetch(path, init);

    if (resp.status === 401) {
        clearTokenAndRedirect();
        return new Promise(() => {});
    }

    if (resp.status === 204) return null;

    let data = null;
    try { data = await resp.json(); } catch { /* not json */ }

    if (!resp.ok) {
        const message = data?.detail || data?.error || `HTTP ${resp.status}`;
        const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
        err.status = resp.status;
        err.data = data;
        throw err;
    }
    return data;
}

export const api = {
    get: (path) => _fetch('GET', path),
    post: (path, body) => _fetch('POST', path, { body }),
    put: (path, body) => _fetch('PUT', path, { body }),
    delete: (path) => _fetch('DELETE', path),
    upload: (path, formData) => _fetch('POST', path, { body: formData }),
};

export function toast(message, kind = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast show${kind === 'error' ? ' err' : ''}`;
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { el.className = 'toast'; }, 2200);
}

// Auth gate: any protected page redirects to /login if no JWT.
if (!PUBLIC_PATHS.includes(window.location.pathname) && !getToken()) {
    window.location.href = '/login';
}
