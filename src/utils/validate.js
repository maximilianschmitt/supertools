const Joi = require("joi");
const _ = require("lodash");
const ValidationError = require("../errors/ValidationError");

const joiErrorToValidationError = joiError => {
    const fields = {};
    const errors = [];
    joiError.details.forEach(detail => {
        if (_.get(fields, detail.path)) {
            return;
        }

        _.set(fields, detail.path, detail.message);
        errors.push(detail.message);
    });

    return new ValidationError({ fields, errors });
};

const validate = {
    body: schema => {
        return (req, res, next) => {
            const result = Joi.validate(req.body, schema, {
                stripUnknown: true,
                abortEarly: false
            });

            if (!result.error) {
                next();
            } else {
                next(joiErrorToValidationError(result.error));
            }
        };
    }
};

module.exports = validate;
