const gitoliteAdmin = require("../src/gitolite-admin");

async function main() {
    await gitoliteAdmin.sync();
}

main();
