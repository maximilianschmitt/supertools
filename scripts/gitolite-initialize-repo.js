const gitoliteAdmin = require("../src/gitolite-admin");

const userAppName = process.argv[2];

if (!userAppName) {
    throw new Error("Please provide userAppName as first positional argument");
}

async function main() {
    await gitoliteAdmin.initializeRepo(userAppName);
}

main();
