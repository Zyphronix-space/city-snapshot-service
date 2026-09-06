// In-process counters exposed via GET /api/v1/metrics and used to compute
// GET /api/v1/health's per-upstream status. Everything here is a real,
// measured count from this running process — nothing is fabricated, and
// nothing survives a restart (there's no metrics backend to persist to,
// which is fine for a single-instance demo service; see README's
// "Future improvements" for what a production version would add).
import ballerina/time;

type UpstreamState record {|
    int lastLatencyMs = 0;
    string lastCheckedAt = "";
    string? lastError = ();
    boolean everSucceeded = false;
|};

isolated class ServiceMetrics {
    private int totalRequests = 0;
    private int cacheHits = 0;
    private int cacheMisses = 0;
    private map<int> requestsByEndpoint = {};
    private map<int> errorsByUpstream = {};
    private map<UpstreamState> upstreams = {};
    private final string startedAt;

    function init() {
        self.startedAt = time:utcToString(time:utcNow());
    }

    isolated function recordRequest(string endpoint) {
        lock {
            self.totalRequests += 1;
            self.requestsByEndpoint[endpoint] = (self.requestsByEndpoint[endpoint] ?: 0) + 1;
        }
    }

    isolated function recordCacheHit() {
        lock {
            self.cacheHits += 1;
        }
    }

    isolated function recordCacheMiss() {
        lock {
            self.cacheMisses += 1;
        }
    }

    isolated function recordUpstreamSuccess(string upstream, int latencyMs) {
        string now = time:utcToString(time:utcNow());
        lock {
            self.upstreams[upstream] = {lastLatencyMs: latencyMs, lastCheckedAt: now, lastError: (), everSucceeded: true};
        }
    }

    isolated function recordUpstreamFailure(string upstream, string errorMessage) {
        string now = time:utcToString(time:utcNow());
        lock {
            self.errorsByUpstream[upstream] = (self.errorsByUpstream[upstream] ?: 0) + 1;
            UpstreamState prior = self.upstreams[upstream] ?: {};
            self.upstreams[upstream] = {
                lastLatencyMs: prior.lastLatencyMs,
                lastCheckedAt: now,
                lastError: errorMessage,
                everSucceeded: prior.everSucceeded
            };
        }
    }

    isolated function snapshot() returns MetricsResponse {
        lock {
            int total = self.cacheHits + self.cacheMisses;
            float rate = total == 0 ? 0.0 : (<float>self.cacheHits / <float>total) * 100.0;
            return {
                totalRequests: self.totalRequests,
                cacheHits: self.cacheHits,
                cacheMisses: self.cacheMisses,
                cacheHitRatePercent: rate,
                requestsByEndpoint: self.requestsByEndpoint.clone(),
                errorsByUpstream: self.errorsByUpstream.clone(),
                startedAt: self.startedAt
            };
        }
    }

    isolated function healthSnapshot() returns UpstreamHealth[] {
        lock {
            UpstreamHealth[] result = [];
            foreach string name in UPSTREAM_NAMES {
                UpstreamState? st = self.upstreams[name];
                if st is () {
                    result.push({name, status: "unknown", lastLatencyMs: (), lastCheckedAt: (), lastError: ()});
                } else {
                    string status = st.lastError is () ? "operational" :
                        (st.everSucceeded ? "degraded" : "unavailable");
                    result.push({
                        name,
                        status,
                        lastLatencyMs: st.lastLatencyMs == 0 ? () : st.lastLatencyMs,
                        lastCheckedAt: st.lastCheckedAt == "" ? () : st.lastCheckedAt,
                        lastError: st.lastError
                    });
                }
            }
            return result.cloneReadOnly();
        }
    }
}

const string UPSTREAM_GEOCODING = "geocoding";
const string UPSTREAM_WEATHER = "weather";
const string UPSTREAM_AIR_QUALITY = "air-quality";
const string UPSTREAM_CURRENCY = "currency";
final string[] & readonly UPSTREAM_NAMES = [UPSTREAM_GEOCODING, UPSTREAM_WEATHER, UPSTREAM_AIR_QUALITY, UPSTREAM_CURRENCY];

final ServiceMetrics serviceMetrics = new;
