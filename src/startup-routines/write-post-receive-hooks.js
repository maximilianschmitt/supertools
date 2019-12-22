const userAppsLib = require("../services/user-apps/lib");

async function writePostReceiveHooks() {
    console.log("Ensuring post-receive hooks are setup...");
    const folderNames = await userAppsLib.getUserAppList();

    for (const folderName of folderNames) {
        await userAppsLib.writePostReceiveHook(folderName);
    }
}

module.exports = writePostReceiveHooks;
