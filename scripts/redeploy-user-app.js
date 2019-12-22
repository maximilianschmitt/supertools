#!/usr/bin/env node
/* eslint-disable no-process-exit */
const pm2 = require("pm2");
const userAppsLib = require("../src/services/user-apps/lib");
const connectPM2 = require("../src/startup-routines/connect-pm2");

const folderName = process.argv[2];
if (!folderName) {
    console.error("Please provide folderName as first positional argument");

    process.exit(1);
}

console.log(`Redeploying ${folderName}`);
console.log("CWD:", process.cwd());

installDepsAndReloadApp(folderName);

async function installDepsAndReloadApp(folderName) {
    await connectPM2();

    try {
        console.log("Installing dependencies...");
        const install = userAppsLib.installDependencies(folderName);

        install.childProcess.stdout.pipe(process.stdout);
        install.childProcess.stderr.pipe(process.stderr);

        await install;
    } catch (err) {
        console.error("Error installing dependencies");
        console.error(err.stack || err);

        process.exit(1);
    }

    if (await userAppsLib.appHasBuildScript(folderName)) {
        try {
            console.log("Building app...");
            const build = userAppsLib.buildApp(folderName);

            build.childProcess.stdout.pipe(process.stdout);
            build.childProcess.stderr.pipe(process.stderr);

            await build;
        } catch (err) {
            console.error("Error building app");
            console.error(err.stack || err);

            process.exit(1);
        }
    }

    try {
        console.log(`Restarting ${folderName}...`);
        await userAppsLib.reloadApp(folderName);
    } catch (err) {
        console.error("Error restarting app");
        console.error(err.stack || err);
    }

    await pm2.disconnect();
}
