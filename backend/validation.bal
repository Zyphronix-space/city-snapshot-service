import ballerina/lang.regexp;

// City names: letters (incl. common Latin-extended accents), spaces,
// hyphens, apostrophes, periods and commas — covers "São Paulo",
// "Saint-Étienne", "St. Louis", "Washington, D.C." without opening the
// door to obviously-invalid input (digits, punctuation soup).
final regexp:RegExp CITY_NAME_PATTERN = re `^[A-Za-zÀ-ɏ\s'.,\-]+$`;
final regexp:RegExp CURRENCY_CODE_PATTERN = re `^[A-Za-z]{3}$`;

isolated function validateCityName(string rawCity) returns string|ErrorResponse {
    string city = rawCity.trim();
    if city.length() == 0 {
        return buildError("INVALID_CITY", "City name must not be empty.");
    }
    if city.length() > 100 {
        return buildError("INVALID_CITY", "City name is too long.");
    }
    if !CITY_NAME_PATTERN.isFullMatch(city) {
        return buildError("INVALID_CITY", "City name contains characters that aren't valid in a place name.");
    }
    return city;
}

isolated function validateCurrencyCode(string rawCode) returns string|ErrorResponse {
    string code = rawCode.trim().toUpperAscii();
    if !CURRENCY_CODE_PATTERN.isFullMatch(code) {
        return buildError("INVALID_CURRENCY", string `'${rawCode}' is not a valid 3-letter currency code.`);
    }
    return code;
}

isolated function validateAmount(float amount) returns float|ErrorResponse {
    if amount.isNaN() || amount.isInfinite() {
        return buildError("INVALID_REQUEST", "Amount must be a finite number.");
    }
    if amount <= 0.0 {
        return buildError("INVALID_REQUEST", "Amount must be greater than zero.");
    }
    if amount > 1000000000000.0 {
        return buildError("INVALID_REQUEST", "Amount is unreasonably large.");
    }
    return amount;
}
