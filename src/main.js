require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const lessMiddleware = require("less-middleware");
const session = require("express-session");
const SessionFileStore = require("session-file-store")(session);
const flash = require("connect-flash");
const config = require("./config");
const ensureUserAppsDirExists = require("./startup-routines/ensure-user-apps-dir-exists");
const ensureDataDirExists = require("./startup-routines/ensure-data-dir-exists");
const recreateUserAppEcosystems = require("./startup-routines/recreate-user-app-ecosystems");
const connectPm2 = require("./startup-routines/connect-pm2");
const settingsLib = require("./services/settings/lib");
const subdomainProxy = require("./subdomain-proxy");
const gitoliteAdmin = require("./gitolite-admin");
const writePostReceiveHooks = require("./startup-routines/write-post-receive-hooks");
const flashClientErrors = require("./utils/flash-client-errors");

const {
    PORT,
    SESSION_SECRET,
    SESSIONS_DIR,
    SLACK_CLIENT_ID,
    SLACK_CONFIGURED,
    SUPERTOOLS_SITE_URL,
    APP_PROTOCOL,
    APP_DOMAIN
} = config;

process.on("uncaughtException", err => {
    console.error(err.stack || err);
});

process.on("unhandledRejection", err => {
    console.error(err.stack || err);
});

async function main() {
    const app = express();

    // Configure Express
    app.use(
        session({
            store: new SessionFileStore({ path: SESSIONS_DIR }),
            cookie: {
                domain: `.${APP_DOMAIN}`,
                httpOnly: true
            },
            secret: SESSION_SECRET,
            resave: false,
            saveUninitialized: false
        })
    );
    subdomainProxy(app);
    app.set("view engine", "pug");
    app.set("views", "src");
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(
        "/public/styles",
        lessMiddleware(path.join(__dirname, "styles"), {
            dest: path.join(__dirname, "public/styles")
        })
    );
    app.use("/public", express.static("src/public"));
    app.use(flash());
    app.use((req, res, next) => {
        const flashed = req.flash();

        res.locals.flash = {
            successMessages: [],
            errorMessages: [],
            ...flashed
        };

        if (flashed.originalInput && flashed.originalInput.length > 0) {
            res.locals.originalInput = flashed.originalInput[0];
        } else {
            res.locals.originalInput = {};
        }

        next();
    });

    // Run startup routines
    await connectPm2();
    await ensureUserAppsDirExists();
    await ensureDataDirExists();
    await recreateUserAppEcosystems();
    if (!config.GITOLITE_ENABLED) {
        await writePostReceiveHooks();
    }

    app.use(async (req, res, next) => {
        try {
            req.team = await settingsLib.getTeam();
            res.locals.appName = config.APP_NAME;
            res.locals.teamName = await settingsLib.getTeamName();
            res.locals.team = await settingsLib.getTeam();
            res.locals.slackClientId = SLACK_CLIENT_ID;
            res.locals.slackConfigured = SLACK_CONFIGURED;
            res.locals.supertoolsSiteUrl = SUPERTOOLS_SITE_URL;
            res.locals.appUrl = `${APP_PROTOCOL}://${APP_DOMAIN}`;
            res.locals.titleStack = [];
            res.locals.formatDate = d =>
                `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
            res.locals.formatTime = d => d.getHours() + ":" + d.getMinutes();
            res.locals.formatDateAndTime = d =>
                `${res.locals.formatDate(d)} at ${res.locals.formatTime(d)}`;

            next();
        } catch (err) {
            next(err);
        }
    });

    // Register services
    require("./services/users/service")(app);
    require("./services/settings/service")(app);
    require("./services/user-apps/service")(app);

    app.use(flashClientErrors());

    console.log("Start listening...");
    app.listen(PORT, err => {
        if (err) {
            throw err;
        }

        console.log(`Listening on port ${PORT}`);

        if (config.GITOLITE_ENABLED) {
            gitoliteAdmin.syncPeriodically(1000, err => {
                if (err) {
                    console.error("Error syncing with gitolite");
                    console.error(err.stack || err);
                } else {
                    console.log("Gitolite synced");
                }
            });
        }
    });
}

main();
