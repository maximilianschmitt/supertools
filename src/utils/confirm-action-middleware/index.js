function confirmActionMiddleware(cb) {
    return function(req, res, next) {
        if (req.body["__confirmActionMiddleware__confirmed"] === "confirmed") {
            req.body = JSON.parse(
                req.body["__confirmActionMiddleware__initialData"]
            );

            return next();
        }

        const { title, confirmButtonText, when } = cb(req);

        if (when && !when()) {
            return next();
        }

        res.render(
            "utils/confirm-action-middleware/confirm-action-middleware",
            {
                title,
                confirmButtonText,
                backLink: req.query.backLink || req.get("Referrer") || "/",
                action: req.url,
                initialData: req.body
            }
        );
    };
}

module.exports = confirmActionMiddleware;
