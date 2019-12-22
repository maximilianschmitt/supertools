class ClientError extends Error {
    constructor(message, { redirect = undefined } = {}) {
        super(message);
        this.redirect = redirect;
    }
}

module.exports = ClientError;
