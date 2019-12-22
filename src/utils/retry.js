class RetryTimeoutError extends Error {
    constructor() {
        super();
        this.name = RetryTimeoutError;
    }
}

async function retry(fn, { times = 5, delay = 50, backoff = true } = {}) {
    if (times < 1) {
        throw new RetryTimeoutError();
    }

    const isRetry = arguments[2];

    if (isRetry) {
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    return fn(() =>
        retry(
            fn,
            {
                times: times - 1,
                delay: backoff && isRetry ? delay * 2 : delay,
                backoff
            },
            true
        )
    );
}

module.exports = retry;

module.exports.RetryTimeoutError = RetryTimeoutError;
