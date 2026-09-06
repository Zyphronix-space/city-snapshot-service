// ISO 3166-1 alpha-2 country code -> ISO 4217 currency code. Used to pick
// which currency a city's snapshot should show automatically (e.g. Tokyo ->
// JPY) instead of asking the caller to already know it. Not exhaustive —
// covers the countries a city search is realistically going to return —
// falls back to USD, which open.er-api.com always has a rate for.
final map<string> & readonly countryCurrency = {
    "US": "USD", "GB": "GBP", "LK": "LKR", "IN": "INR", "JP": "JPY", "SG": "SGD",
    "AE": "AED", "AU": "AUD", "DE": "EUR", "FR": "EUR", "IT": "EUR", "ES": "EUR",
    "NL": "EUR", "IE": "EUR", "PT": "EUR", "FI": "EUR", "BE": "EUR", "AT": "EUR",
    "GR": "EUR", "LU": "EUR", "MT": "EUR", "CY": "EUR", "SK": "EUR", "SI": "EUR",
    "EE": "EUR", "LV": "EUR", "LT": "EUR", "HR": "EUR",
    "CA": "CAD", "CN": "CNY", "HK": "HKD", "MY": "MYR", "TH": "THB", "ID": "IDR",
    "PH": "PHP", "VN": "VND", "KR": "KRW", "PK": "PKR", "BD": "BDT", "NP": "NPR",
    "NZ": "NZD", "ZA": "ZAR", "BR": "BRL", "MX": "MXN", "RU": "RUB", "SA": "SAR",
    "QA": "QAR", "KW": "KWD", "BH": "BHD", "OM": "OMR", "JO": "JOD", "CH": "CHF",
    "SE": "SEK", "NO": "NOK", "DK": "DKK", "PL": "PLN", "CZ": "CZK", "HU": "HUF",
    "RO": "RON", "BG": "BGN", "TR": "TRY", "EG": "EGP", "NG": "NGN", "KE": "KES",
    "GH": "GHS", "TZ": "TZS", "UG": "UGX", "MA": "MAD", "DZ": "DZD", "TN": "TND",
    "IL": "ILS", "AR": "ARS", "CL": "CLP", "CO": "COP", "PE": "PEN", "UA": "UAH",
    "IS": "ISK", "TW": "TWD", "MM": "MMK", "KH": "KHR", "LA": "LAK", "MV": "MVR",
    "AF": "AFN", "IR": "IRR", "IQ": "IQD", "MN": "MNT", "KZ": "KZT", "UZ": "UZS",
    "GE": "GEL", "AM": "AMD", "AZ": "AZN", "RS": "RSD", "BA": "BAM", "MK": "MKD",
    "AL": "ALL", "MD": "MDN", "BY": "BYN", "FJ": "FJD", "PG": "PGK", "JM": "JMD",
    "TT": "TTD", "BS": "BSD", "BB": "BBD", "UY": "UYU", "PY": "PYG", "BO": "BOB",
    "EC": "USD", "PA": "USD", "VE": "VES", "CU": "CUP", "DO": "DOP", "GT": "GTQ",
    "HN": "HNL", "NI": "NIO", "CR": "CRC", "SV": "USD", "ET": "ETB", "ZM": "ZMW",
    "ZW": "ZWL", "MZ": "MZN", "AO": "AOA", "SN": "XOF", "CI": "XOF", "CM": "XAF"
};

isolated function currencyForCountry(string countryCode) returns string {
    return countryCurrency[countryCode.toUpperAscii()] ?: "USD";
}
