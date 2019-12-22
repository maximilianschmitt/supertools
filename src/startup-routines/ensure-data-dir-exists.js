const fs = require("fs-extra");
const config = require("../config");

const {
    DATA_DIR,
    USER_APP_ECOSYSTEMS_DIR,
    APP_TEMPLATES_DIR,
    TRASH_DIR
} = config;

async function ensureDataDirExists() {
    console.log("Ensuring data dir exists...");
    await fs.mkdirp(DATA_DIR);
    await fs.mkdirp(USER_APP_ECOSYSTEMS_DIR);
    await fs.mkdirp(APP_TEMPLATES_DIR);
    await fs.mkdirp(TRASH_DIR);
}

module.exports = ensureDataDirExists;
