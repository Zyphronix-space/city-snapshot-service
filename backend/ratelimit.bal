// Fixed-window rate limiter protecting the upstream-calling endpoints.
// Deliberately a single global window rather than per-client: the thing
// actually worth protecting here is the free-tier upstream APIs (Open-Meteo,
// open.er-api.com), which this whole service shares one quota with
// regardless of which caller triggered the request. A per-IP limiter would
// need request-level access to the caller's remote address, which would
// force every resource function in this service onto the manual
// http:Caller-response pattern instead of typed return values — a much
// larger change for a demo-scale service. Documented as a scope decision,
// not an oversight; see README "Rate limiting".
import ballerina/time;

isolated class FixedWindowRateLimiter {
    private final int windowSeconds;
    private final int maxRequests;
    private int windowStart = 0;
    private int count = 0;

    isolated function init(int maxRequests, int windowSeconds) {
        self.maxRequests = maxRequests;
        self.windowSeconds = windowSeconds;
    }

    // Returns () when the request is allowed, or the number of seconds
    // until the window resets when it should be rejected.
    isolated function tryAcquire() returns int? {
        time:Utc utc = time:utcNow();
        int nowSeconds = utc[0];
        lock {
            if nowSeconds - self.windowStart >= self.windowSeconds {
                self.windowStart = nowSeconds;
                self.count = 0;
            }
            if self.count >= self.maxRequests {
                int retryAfter = self.windowSeconds - (nowSeconds - self.windowStart);
                return retryAfter < 1 ? 1 : retryAfter;
            }
            self.count += 1;
            return ();
        }
    }
}

configurable int rateLimitMaxRequests = 60;
configurable int rateLimitWindowSeconds = 60;

final FixedWindowRateLimiter upstreamRateLimiter = new (rateLimitMaxRequests, rateLimitWindowSeconds);
