/** Error with an HTTP status that API routes can turn into a JSON response. */
export class AppError extends Error {
    constructor(message, status = 400, extra = {}) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.extra = extra;
    }
}

/** Convert any thrown error into [body, status] for NextResponse.json */
export function errorResponseParts(error, fallbackMessage = 'Something went wrong') {
    if (error instanceof AppError) {
        return [{ error: error.message, ...error.extra }, error.status];
    }
    if (error?.name === 'ZodError') {
        return [{ error: error.errors?.[0]?.message || 'Invalid input' }, 400];
    }
    console.error(fallbackMessage, error);
    return [{ error: fallbackMessage }, 500];
}
