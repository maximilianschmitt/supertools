/* eslint-disable no-process-exit */
const settingsLib = require("../src/services/settings/lib");
const usersLib = require("../src/services/users/lib");
const argv = require("minimist")(process.argv.slice(2));

const username = argv.username;
const email = argv.email;
const password = argv.password;
const hashedPassword = argv["hashed-password"];
const team = argv.team;

const error = message => {
    console.error(message);
    process.exit(1);
};

if (!username) {
    error("Please provide --username");
}
if (!email) {
    error("Please provide --email");
}
if (!password && !hashedPassword) {
    error("Please provide --password or --hashed-password");
}
if (!team) {
    error("Please provide --team");
}

async function main() {
    await settingsLib.updateTeam({
        name: team,
        slack: null,
        signupEmailDomains: []
    });

    await usersLib.unsafeCreate({
        username,
        email,
        password,
        hashedPassword,
        role: "admin"
    });
}

main();
