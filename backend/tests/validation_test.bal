import ballerina/test;

@test:Config {}
function testValidCityNameIsTrimmedAndAccepted() returns error? {
    string|ErrorResponse result = validateCityName("  Colombo  ");
    test:assertTrue(result is string);
    test:assertEquals(<string>result, "Colombo");
}

@test:Config {}
function testCityNameWithAccentsAndPunctuationIsAccepted() returns error? {
    string|ErrorResponse result = validateCityName("São Paulo");
    test:assertTrue(result is string);

    string|ErrorResponse result2 = validateCityName("Washington, D.C.");
    test:assertTrue(result2 is string);
}

@test:Config {}
function testEmptyCityNameIsRejected() {
    string|ErrorResponse result = validateCityName("   ");
    test:assertTrue(result is ErrorResponse);
    if result is ErrorResponse {
        test:assertEquals(result.'error.code, "INVALID_CITY");
    }
}

@test:Config {}
function testCityNameWithDigitsIsRejected() {
    string|ErrorResponse result = validateCityName("Colombo123");
    test:assertTrue(result is ErrorResponse);
}

@test:Config {}
function testOverlongCityNameIsRejected() {
    string longName = "";
    foreach int i in 0 ..< 101 {
        longName = longName + "a";
    }
    string|ErrorResponse result = validateCityName(longName);
    test:assertTrue(result is ErrorResponse);
}

@test:Config {}
function testValidCurrencyCodeIsUppercased() {
    string|ErrorResponse result = validateCurrencyCode("jpy");
    test:assertTrue(result is string);
    test:assertEquals(<string>result, "JPY");
}

@test:Config {}
function testInvalidCurrencyCodeIsRejected() {
    string|ErrorResponse tooShort = validateCurrencyCode("US");
    test:assertTrue(tooShort is ErrorResponse);

    string|ErrorResponse withDigits = validateCurrencyCode("U5D");
    test:assertTrue(withDigits is ErrorResponse);
}

@test:Config {}
function testPositiveAmountIsAccepted() {
    float|ErrorResponse result = validateAmount(100.0);
    test:assertTrue(result is float);
}

@test:Config {}
function testZeroAndNegativeAmountsAreRejected() {
    test:assertTrue(validateAmount(0.0) is ErrorResponse);
    test:assertTrue(validateAmount(-50.0) is ErrorResponse);
}

@test:Config {}
function testNonFiniteAmountsAreRejected() {
    test:assertTrue(validateAmount(float:NaN) is ErrorResponse);
    test:assertTrue(validateAmount(float:Infinity) is ErrorResponse);
}

@test:Config {}
function testUnreasonablyLargeAmountIsRejected() {
    float|ErrorResponse result = validateAmount(1000000000001.0);
    test:assertTrue(result is ErrorResponse);
}
