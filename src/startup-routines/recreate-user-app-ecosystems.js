const lib = require("../services/user-apps/lib");

async function recreateUserAppEcosystems() {
    console.log("Recreating user-app ecosystems...");
    const folderNames = await lib.getUserAppList();

    for (const folderName of folderNames) {
        await lib.createUserAppEcosystem(folderName);
        console.log(`Starting ${folderName}`);
        await lib.startApp(folderName);
        const isUserAppValid = await lib.isUserAppValid(folderName);

        if (!isUserAppValid) {
            console.error(folderName, "is invalid");
        }
    }
}

module.exports = recreateUserAppEcosystems;
