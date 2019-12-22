const _ = require("lodash");
const ValidationError = require("../errors/ValidationError");
const ClientError = require("../errors/ClientError");

const stripSensitiveFields = body => {
    return _.omit(body, ["password", "secrets"]);
};

const flashClientErrors = ({ redirect = "back" } = {}) => {
    return (err, req, res, next) => {
        if (err instanceof ValidationError) {
            err.errors.forEach(error => {
                req.flash("errorMessages", error);
            });

            if (req.body) {
                req.flash("originalInput", stripSensitiveFields(req.body));
            }

            res.redirect(redirect);

            return;
        } else if (err instanceof ClientError) {
            req.flash("errorMessages", err.message);

            if (req.body) {
                req.flash("originalInput", stripSensitiveFields(req.body));
            }

            if (err.redirect) {
                res.redirect(err.redirect);
            } else {
                res.redirect(redirect);
            }

            return;
        }

        next(err);
    };
};

module.exports = flashClientErrors;
