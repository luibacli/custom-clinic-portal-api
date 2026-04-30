const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES   = 20;             // max failed attempts per window per IP

// ip → { count: number, windowStart: number }
const failStore = new Map();

// Prune expired windows every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - AUTH_WINDOW_MS;
  for (const [ip, rec] of failStore) {
    if (rec.windowStart < cutoff) failStore.delete(ip);
  }
}, AUTH_WINDOW_MS / 3).unref();

const authRateLimiter = (req, res, next) => {
  const ip  = req.ip;
  const now = Date.now();
  const rec = failStore.get(ip);

  if (rec) {
    if (now - rec.windowStart > AUTH_WINDOW_MS) {
      failStore.delete(ip);
    } else if (rec.count >= MAX_FAILURES) {
      const retryAfterSec = Math.ceil((rec.windowStart + AUTH_WINDOW_MS - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts, please try again later.',
      });
    }
  }

  // Observe the response status after the handler resolves
  const _json = res.json.bind(res);
  res.json = function (body) {
    const status   = res.statusCode;
    const clientIp = req.ip;
    const ts       = Date.now();

    if (status >= 200 && status < 300) {
      // Successful auth — clear any accumulated failures for this IP
      failStore.delete(clientIp);
    } else if (status === 400 || status === 401 || status === 403) {
      // Auth failure — increment failure counter
      const existing = failStore.get(clientIp);
      if (existing && ts - existing.windowStart <= AUTH_WINDOW_MS) {
        existing.count += 1;
      } else {
        failStore.set(clientIp, { count: 1, windowStart: ts });
      }
    }
    // 404 / 5xx are not auth failure signals — do not count

    return _json(body);
  };

  next();
};

module.exports = authRateLimiter;
