import ballerina/http;
import ballerina/uuid;

// Every error this service returns to a caller goes through here, so the
// shape on the wire is always { "error": { code, message, requestId } } —
// never a raw stack trace or upstream error string.
isolated function buildError(ErrorCode code, string message) returns ErrorResponse {
    return {'error: {code, message, requestId: uuid:createType1AsString()}};
}

isolated function notFoundError(ErrorCode code, string message) returns http:NotFound {
    return {body: buildError(code, message)};
}

isolated function badRequestError(ErrorCode code, string message) returns http:BadRequest {
    return {body: buildError(code, message)};
}

isolated function badGatewayError(ErrorCode code, string message) returns http:BadGateway {
    return {body: buildError(code, message)};
}

isolated function gatewayTimeoutError(ErrorCode code, string message) returns http:GatewayTimeout {
    return {body: buildError(code, message)};
}

isolated function tooManyRequestsError(int retryAfterSeconds) returns http:TooManyRequests {
    return {
        body: buildError("RATE_LIMITED", "Too many requests — please slow down."),
        headers: {"Retry-After": retryAfterSeconds.toString()}
    };
}

isolated function internalError(string message) returns http:InternalServerError {
    return {body: buildError("INTERNAL_ERROR", message)};
}
