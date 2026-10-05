/**
 * Firestore keeps document ids shaped `__name__` for itself: reading or
 * writing one throws (INVALID_ARGUMENT) — it is never "no such document". An
 * id taken from a request is asked this before it names a document, so it is
 * answered as missing (or refused) rather than as a server error.
 */
export const isReservedId = (id: string) => /^__.*__$/.test(id);
