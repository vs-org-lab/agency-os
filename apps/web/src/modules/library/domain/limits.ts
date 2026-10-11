/** The bucket limit per file (free plan, ADR 0003). */
export const MAX_LIBRARY_BYTES = 52_428_800;

/** The organisation ceiling across library files and proofs, under the free plan's 1 GB. */
export const ORGANIZATION_STORAGE_LIMIT_BYTES = 943_718_400;

export const MAX_UPLOAD_BATCH = 100;

/** Root folders sit at depth 0, so folders nest four levels deep. */
export const MAX_FOLDER_DEPTH = 3;

export const MAX_FOLDER_NAME_LENGTH = 120;

export const MAX_FILE_NAME_LENGTH = 200;

export const MAX_ZIP_FILES = 500;

export const MAX_ZIP_BYTES = 524_288_000;

export const MAX_UPDATE_ATTACHMENTS = 10;

/** SEC-31: files are served by links that expire in 15 minutes. */
export const LIBRARY_LINK_TTL_SECONDS = 900;

/** Signed upload links last two hours; an upload still waiting after three is abandoned. */
export const STALE_UPLOAD_MS = 3 * 60 * 60 * 1000;
