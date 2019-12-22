class NotPermittedError extends Error {
    constructor(message) {
        super();
        this.name = "NotPermittedError";
        this.message = message;
    }
}

module.exports = NotPermittedError;
