const fs = require("fs-extra");
const config = require("../config");

const { USER_APPS_DIR } = config;

async function ensureUserAppsDirExists() {
    console.log("Ensuring user-apps dir exists...");
    await fs.mkdirp(USER_APPS_DIR);
}

module.exports = ensureUserAppsDirExists;
