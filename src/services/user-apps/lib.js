const fs = require("fs-extra");
const exec = require("child-process-promise").exec;
const path = require("path");
const paramCase = require("param-case");
const sentenceCase = require("sentence-case");
const portfinder = require("portfinder");
const pm2 = require("pm2");
const axios = require("axios");
const dotenv = require("dotenv");
const config = require("../../config");
const retry = require("../../utils/retry");
const usersLib = require("../users/lib");
const trash = require("../../utils/trash");
const gitoliteUtils = require("../../utils/gitolite-utils");
const ClientError = require("../../errors/ClientError");

const {
    NODE_ENV,
    DATA_DIR,
    USER_APPS_DIR,
    APP_TEMPLATES_DIR,
    USER_APP_ECOSYSTEMS_DIR,
    DEFAULT_APP_TEMPLATE_DIR,
    APP_PROTOCOL,
    APP_DOMAIN,
    GIT_SSH_USER,
    GIT_SSH_HOST,
    GITOLITE_ENABLED,
    RESERVED_PROCESS_NAMES
} = config;

const RUNTIME_FILE = path.resolve(__dirname, "scripts/runtime.js");

const lib = {
    // ----------------------------------
    // User apps
    // ----------------------------------
    async getAppName(folderName) {
        const appName = await fs.readFile(lib.getAppNameFile(folderName));

        return appName;
    },

    getProcessName(folderName) {
        return RESERVED_PROCESS_NAMES.includes(folderName)
            ? folderName + "-2"
            : folderName;
    },

    getGitRemoteURL(folderName) {
        if (NODE_ENV === "development") {
            return path.join(lib.getWorkingDir(folderName), ".git");
        }

        const repoName = gitoliteUtils.getUserAppRepoName(folderName);

        return `${GIT_SSH_USER}@${GIT_SSH_HOST}:${repoName}.git`;
    },

    async getUserApp(folderName) {
        const ecosystem = JSON.parse(
            await fs.readFile(lib.getEcosystemFile(folderName))
        );

        const processDescription = await new Promise((resolve, reject) => {
            pm2.describe(folderName, (err, processDescription) => {
                if (err) {
                    return reject(err);
                }

                resolve(processDescription[0]);
            });
        });

        const pm2Status = processDescription
            ? processDescription.pm2_env.status
            : "stopped";
        const port = ecosystem.env.PORT;

        const userApp = {
            folderName,
            name: await lib.getAppName(folderName),
            gitRemoteURL: lib.getGitRemoteURL(folderName),
            url: `${APP_PROTOCOL}://${folderName}.${APP_DOMAIN}`,
            internalUrl: `http://localhost:${port}`,
            pm2Status,
            secretKeys: await lib.getSecretKeys(folderName)
        };

        return userApp;
    },

    async getUserApps() {
        const userApps = await lib.getUserAppList();

        return Promise.all(userApps.map(lib.getUserApp));
    },

    async getUserAppList() {
        return fs.readdir(USER_APPS_DIR);
    },

    async createUserAppDir({ folderName, appTemplateFolderName }) {
        folderName = paramCase(folderName);
        const name = sentenceCase(folderName);

        const userAppList = await lib.getUserAppList();
        if (userAppList.includes(folderName)) {
            throw new ClientError(
                `An app with the name "${folderName}" already exists`
            );
        }

        const appTemplatePath = appTemplateFolderName
            ? lib.getAppTemplateRepoDir(appTemplateFolderName)
            : DEFAULT_APP_TEMPLATE_DIR;

        const appWorkingDir = lib.getWorkingDir(folderName);

        await copyAppTemplate();
        await setupAppNameFile();
        await createInitialGitCommit();
        if (!config.GITOLITE_ENABLED) {
            await createPostReceiveHook();
        }
        await createAppEcosystem();
        await startApp();

        return lib.getUserApp(folderName);

        async function copyAppTemplate() {
            await fs.copy(appTemplatePath, appWorkingDir);
        }

        async function setupAppNameFile() {
            await fs.writeFile(lib.getAppNameFile(folderName), name);
        }

        async function createInitialGitCommit() {
            await exec("git init", { cwd: appWorkingDir });
            await exec("git add .", { cwd: appWorkingDir });
            await exec("git commit -m 'Initial commit'", {
                cwd: appWorkingDir
            });
        }

        async function createPostReceiveHook() {
            await lib.writePostReceiveHook(folderName);
        }

        async function createAppEcosystem() {
            await lib.createUserAppEcosystem(folderName);
        }

        async function startApp() {
            await lib.startApp(folderName);
        }
    },

    async writePostReceiveHook(folderName) {
        const appWorkingDir = lib.getWorkingDir(folderName);

        await exec("git config receive.denyCurrentBranch updateInstead", {
            cwd: appWorkingDir
        });

        await fs.writeFile(
            lib.getPostReceiveHookFile(folderName),
            lib.getPostReceiveScript(folderName)
        );

        await fs.chmod(lib.getPostReceiveHookFile(folderName), "755");
    },

    getWorkingDir(folderName) {
        return path.resolve(USER_APPS_DIR, folderName);
    },

    getAppTemplateWorkingDir(folderName) {
        return path.resolve(APP_TEMPLATES_DIR, folderName);
    },

    getEcosystemFile(folderName) {
        return path.resolve(
            USER_APP_ECOSYSTEMS_DIR,
            folderName + ".ecosystem.app.json"
        );
    },

    getPackageJsonFile(folderName) {
        return path.resolve(lib.getWorkingDir(folderName), "package.json");
    },

    getAppNameFile(folderName) {
        return path.resolve(lib.getWorkingDir(folderName), ".app-name");
    },

    getSecretsFile(folderName) {
        return path.resolve(lib.getWorkingDir(folderName), ".env");
    },

    getPostReceiveHookFile(folderName) {
        return path.resolve(
            lib.getWorkingDir(folderName),
            ".git/hooks/post-receive"
        );
    },

    getLogFile(folderName) {
        return path.resolve(DATA_DIR, "logs", folderName + ".log");
    },

    getMainFile(folderName) {
        return path.resolve(lib.getWorkingDir(folderName), "src/index");
    },

    async getSecrets(folderName) {
        const secretsFile = lib.getSecretsFile(folderName);

        await fs.ensureFile(secretsFile);

        return fs.readFile(secretsFile, "utf-8");
    },

    async getSecretKeys(folderName) {
        const secrets = await lib.getSecrets(folderName);

        return Object.keys(dotenv.parse(Buffer.from(secrets)));
    },

    async writeSecrets(folderName, secrets) {
        const secretsFile = lib.getSecretsFile(folderName);

        return fs.writeFile(secretsFile, secrets);
    },

    getLogStream(folderName) {
        return fs.createReadStream(lib.getLogFile(folderName));
    },

    async createUserAppEcosystem(folderName) {
        const port = await portfinder.getPortPromise({
            port: 10000,
            stopPort: 65535
        });

        const ecosystemFile = lib.getEcosystemFile(folderName);

        const ecosystem = {
            name: lib.getProcessName(folderName),
            script: RUNTIME_FILE,
            cwd: lib.getWorkingDir(folderName),
            log: lib.getLogFile(folderName),
            env: {
                PORT: port,
                NODE_ENV: "production",
                MAIN_FILE: lib.getMainFile(folderName)
            }
        };

        await fs.writeFile(ecosystemFile, JSON.stringify(ecosystem, null, 4));
    },

    async startApp(folderName) {
        const ecosystemFile = lib.getEcosystemFile(folderName);

        await new Promise((resolve, reject) => {
            pm2.start(ecosystemFile, (err, apps) => {
                if (err) {
                    return reject(err);
                }

                resolve(apps);
            });
        });
    },

    async reloadApp(folderName) {
        await new Promise((resolve, reject) => {
            pm2.reload(folderName, (err, proc) => {
                if (err) {
                    return reject(err);
                }

                resolve(proc);
            });
        });
    },

    buildApp(folderName) {
        const workingDir = lib.getWorkingDir(folderName);

        return exec("yarn run -s build", { cwd: workingDir });
    },

    installDependencies(folderName) {
        const workingDir = lib.getWorkingDir(folderName);

        return exec("yarn install --production", {
            cwd: workingDir
        });
    },

    async appHasBuildScript(folderName) {
        try {
            const packageJson = await fs.readJson(
                lib.getPackageJsonFile(folderName)
            );

            return !!packageJson.scripts && !!packageJson.scripts.build;
        } catch (err) {
            console.error("Error reading package.json");
            console.error(err.stack || err);

            return false;
        }
    },

    async isUserAppValid(folderName) {
        const userApp = await lib.getUserApp(folderName);

        try {
            const isUserAppValid = await retry(async retry => {
                try {
                    const { data } = await axios.get(
                        userApp.internalUrl + "/__status"
                    );

                    return data.folderName === folderName;
                } catch (err) {
                    return retry();
                }
            });

            return isUserAppValid;
        } catch (err) {
            if (err instanceof retry.RetryTimeoutError) {
                return false;
            }

            throw err;
        }
    },

    getAppArtifactPaths(folderName) {
        return [
            lib.getWorkingDir(folderName),
            lib.getEcosystemFile(folderName),
            lib.getLogFile(folderName)
        ];
    },

    async deleteAppProcess(folderName) {
        return new Promise((resolve, reject) =>
            pm2.delete(lib.getProcessName(folderName), (err, result) => {
                if (err) {
                    return reject(err);
                }

                resolve(result);
            })
        );
    },

    async deleteApp(folderName) {
        await lib.deleteAppProcess(folderName);

        const artifactPaths = lib.getAppArtifactPaths(folderName);
        await Promise.all(artifactPaths.map(trash.moveToTrash));

        await usersLib.removeAppFromAllUsers(folderName);
    },

    // ----------------------------------
    // App templates
    // ----------------------------------
    async getAppTemplatesList() {
        return fs.readdir(APP_TEMPLATES_DIR);
    },

    async getAppTemplates() {
        const folderNames = await lib.getAppTemplatesList();

        return Promise.all(folderNames.map(lib.getAppTemplate));
    },

    async createAppTemplate({ folderName }) {
        folderName = paramCase(folderName);

        const appTemplateRepoDir = lib.getAppTemplateRepoDir(folderName);
        await fs.copy(DEFAULT_APP_TEMPLATE_DIR, appTemplateRepoDir);
        const cwd = appTemplateRepoDir;
        await exec("git init", { cwd });
        await exec("git add .", { cwd });
        await exec("git commit -m 'Initial commit'", { cwd });
        await exec("git config receive.denyCurrentBranch updateInstead", {
            cwd
        });

        return lib.getAppTemplate(folderName);
    },

    async getAppTemplate(folderName) {
        const userApp = {
            folderName,
            gitRemoteURL: lib.getAppTemplateGitRemoteURL(folderName),
            latestCommit: await lib.getLatestAppTemplateCommit(folderName)
        };

        return userApp;
    },

    async deleteAppTemplate(folderName) {
        const repoDir = lib.getAppTemplateRepoDir(folderName);
        await trash.moveToTrash(repoDir);
    },

    getAppTemplateRepoDir(folderName) {
        return path.resolve(APP_TEMPLATES_DIR, folderName);
    },

    getAppTemplateGitRemoteURL(folderName) {
        if (NODE_ENV === "development") {
            return path.join(lib.getAppTemplateRepoDir(folderName), ".git");
        }

        const repoName = gitoliteUtils.getAppTemplateRepoName(folderName);

        return `${GIT_SSH_USER}@${GIT_SSH_HOST}:${repoName}.git`;
    },

    async getLatestAppTemplateCommit(folderName) {
        const cwd = GITOLITE_ENABLED
            ? gitoliteUtils.getAppTemplateRepoDir(folderName)
            : lib.getAppTemplateRepoDir(folderName);
        try {
            const { stdout } = await exec("git log -1", { cwd });

            // -------------------------------------------------------------------------------
            // Example commit:
            // -------------------------------------------------------------------------------
            // commit 79c63fddc704bfa65dfedbc1136f5b7efa3129b5 (HEAD -> master, origin/master)
            // Author: Maximilian Schmitt <maximilian.schmitt@googlemail.com>
            // Date:   Tue May 7 02:20:53 2019 +0200
            //
            //     DATA_DIR/data-stores -> DATA_DIR/stores
            const lines = stdout.split("\n");
            const hash = lines[0].split(" ")[1];
            const shortHash = lines[0].split(" ")[1].slice(0, 6);
            const author = lines[1].slice("Author:".length).trim();
            const message = lines
                .slice(4)
                .map(line => line.trim())
                .join("\n");
            const shortMessage = message.slice(0, 60);

            const commit = {
                hash,
                shortHash,
                author,
                message,
                shortMessage
            };

            return commit;
        } catch (err) {
            return null;
        }
    },

    getPostReceiveScript(folderName) {
        const workingDir = lib.getWorkingDir(folderName);

        return `#!/usr/bin/env bash
GIT_WORK_TREE="${workingDir}" git checkout -f
(cd "${process.cwd()}" && node -r dotenv/config scripts/redeploy-user-app "${folderName}")`;
    },

    // This post-receive script is only necessary when using gitolite
    getAppTemplatePostReceiveScript(folderName) {
        const workingDir = lib.getAppTemplateWorkingDir(folderName);

        return `#!/usr/bin/env bash
(GIT_WORK_TREE="${workingDir}" git checkout -f)`;
    }
};

module.exports = lib;
