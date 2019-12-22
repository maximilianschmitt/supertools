const path = require("path");

const config = {
    NODE_ENV: process.env.NODE_ENV,
    APP_NAME: "Supertools",
    PORT: Number(process.env.PORT),
    DATA_DIR: path.resolve(process.cwd(), process.env.DATA_DIR),
    TRASH_DIR: path.resolve(process.cwd(), process.env.DATA_DIR, "trash"),
    USER_APP_ECOSYSTEMS_DIR: path.resolve(
        process.cwd(),
        process.env.DATA_DIR,
        "user-app-ecosystems"
    ),
    USER_APPS_DIR: path.resolve(process.cwd(), process.env.DATA_DIR, "apps"),
    SESSIONS_DIR: path.resolve(process.cwd(), process.env.DATA_DIR, "sessions"),
    APP_TEMPLATES_DIR: path.resolve(
        process.cwd(),
        process.env.DATA_DIR,
        "app-templates"
    ),
    DEFAULT_APP_TEMPLATE_DIR: path.resolve(
        process.cwd(),
        "default-app-template"
    ),
    SESSION_SECRET: process.env.SESSION_SECRET,
    GITOLITE_ENABLED: process.env.GITOLITE_ENABLED === "true",
    GITOLITE_ADMIN_PATH: process.env.GITOLITE_ADMIN_PATH,
    GITOLITE_REPOSITORIES_PATH: process.env.GITOLITE_REPOSITORIES_PATH,
    GIT_SSH_USER: process.env.GIT_SSH_USER,
    GIT_SSH_HOST: process.env.GIT_SSH_HOST,
    RESERVED_PROCESS_NAMES: ["supertools"],
    SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
    SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
    SLACK_CONFIGURED:
        !!process.env.SLACK_CLIENT_ID && !!process.env.SLACK_CLIENT_SECRET,
    SUPERTOOLS_SITE_URL: process.env.SUPERTOOLS_SITE_URL,
    APP_PROTOCOL: process.env.APP_PROTOCOL,
    APP_DOMAIN: process.env.APP_DOMAIN
};

module.exports = config;
