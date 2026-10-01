/**
 * How big an upload to /api/upload may be — shared by the route and the
 * browser, which checks before sending. A Vercel function refuses a request
 * body past ~4.5 MB before the route ever runs (an opaque error), so the
 * route answers 413 itself below that.
 */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** The largest file a client should send: the request's limit, less room for the multipart wrapping around it. */
export const UPLOAD_MAX_FILE_BYTES = UPLOAD_MAX_BYTES - 16 * 1024;
