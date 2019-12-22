const httpProxy = require("http-proxy");
const vhost = require("vhost");
const express = require("express");
const userAppsLib = require("./services/user-apps/lib");
const config = require("./config");
const usersLib = require("./services/users/lib");
const NotPermittedError = require("./errors/NotPermittedError");

const { APP_DOMAIN } = config;

const subdomainProxy = app => {
    const proxy = httpProxy.createProxyServer();

    proxy.on("error", err => {
        console.error("Proxy error:");
        console.error(err.stack || err);
    });

    const forwardToSupertoolsInstance = async (req, res, next) => {
        try {
            const { user } = req;

            const appSlug = req.vhost[0];

            const mayAccess =
                !!user && (await usersLib.mayUserAccessApp(user, appSlug));
            if (!mayAccess) {
                next(
                    new NotPermittedError("You don't have access to " + appSlug)
                );

                return;
            }

            const userApp = await userAppsLib.getUserApp(appSlug);
            if (!userApp) {
                throw new Error(`App not found: ${appSlug}`);
            }

            proxy.web(req, res, {
                target: userApp.internalUrl
            });
        } catch (err) {
            next(err);
        }
    };

    const proxyApp = express();

    proxyApp.use(usersLib.middlewares.authenticate);
    proxyApp.use(forwardToSupertoolsInstance);

    // {folder-name}.{team-slug}.supertools.app
    app.use(vhost(`*.${APP_DOMAIN}`, proxyApp));
};

module.exports = subdomainProxy;
