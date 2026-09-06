import ballerina/test;

@test:Config {}
function testTtlCachePutThenGetReturnsSameValue() {
    TtlCache cache = new;
    cache.put("key1", {"hello": "world"}, 60);
    json? result = cache.get("key1");
    test:assertEquals(result, <json>{"hello": "world"});
}

@test:Config {}
function testTtlCacheMissReturnsNil() {
    TtlCache cache = new;
    json? result = cache.get("does-not-exist");
    test:assertTrue(result is ());
}

@test:Config {}
function testTtlCacheExpiredEntryIsTreatedAsMiss() {
    TtlCache cache = new;
    // A negative TTL means "already expired" the instant it's written —
    // exercises the expiry branch without needing to sleep in a test.
    cache.put("stale", "value", -1);
    json? result = cache.get("stale");
    test:assertTrue(result is ());
}

@test:Config {}
function testCurrencyForKnownCountryCodes() {
    test:assertEquals(currencyForCountry("JP"), "JPY");
    test:assertEquals(currencyForCountry("lk"), "LKR");
    test:assertEquals(currencyForCountry("US"), "USD");
}

@test:Config {}
function testCurrencyForUnknownCountryFallsBackToUsd() {
    test:assertEquals(currencyForCountry("ZZ"), "USD");
}

@test:Config {}
function testFixedWindowRateLimiterAllowsUpToLimitThenRejects() {
    FixedWindowRateLimiter limiter = new (3, 60);
    test:assertTrue(limiter.tryAcquire() is ());
    test:assertTrue(limiter.tryAcquire() is ());
    test:assertTrue(limiter.tryAcquire() is ());
    int? blocked = limiter.tryAcquire();
    test:assertTrue(blocked is int);
}

@test:Config {}
function testBuildErrorShapeIncludesCodeMessageAndRequestId() {
    ErrorResponse err = buildError("CITY_NOT_FOUND", "No city found matching 'Nowhere'.");
    test:assertEquals(err.'error.code, "CITY_NOT_FOUND");
    test:assertEquals(err.'error.message, "No city found matching 'Nowhere'.");
    test:assertTrue(err.'error.requestId.length() > 0);
}
