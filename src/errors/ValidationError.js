class ValidationError extends Error {
    constructor({ fields = {}, errors = [] } = {}) {
        super();
        this.name = "ValidationError";
        this.fields = fields;
        this.errors = errors;
    }
}

module.exports = ValidationError;
