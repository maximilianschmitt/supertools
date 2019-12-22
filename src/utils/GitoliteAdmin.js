const fs = require("fs-extra");
const path = require("path");
const usersLib = require("../services/users/lib");
const userAppsLib = require("../services/user-apps/lib");
const gitoliteUtils = require("./gitolite-utils");
const exec = require("child-process-promise").exec;
const Queue = require("promise-queue");

class GitoliteAdmin {
    constructor({ gitoliteAdminPath, gitoliteReposDir }) {
        this.gitoliteAdminPath = gitoliteAdminPath;
        this.gitoliteReposDir = gitoliteReposDir;
        this.gitoliteConfigPath = path.join(
            gitoliteAdminPath,
            "conf/gitolite.conf"
        );
        // All supertools-managed keys live in the supertools folder:
        this.keydirPath = path.join(gitoliteAdminPath, "keydir/supertools");
        // Queue operations so they don't conflict with each other.
        // The maxQueued-limit is set to Infinity but in the sync-method we manually
        // ensure that we don't queue more than one sync at a time. We do it manually
        // because `this.queue.add` will throw if the maxQueued-limit is reached.
        this.queue = new Queue(1, Infinity);
    }

    getGitoliteBinFile() {
        return "/home/git/bin/gitolite";
    }

    getUserAppRepoDir(folderName) {
        const repoName = gitoliteUtils.getUserAppRepoName(folderName);

        return `/home/git/repositories/${repoName}.git`;
    }

    getUserAppPostReceiveHookFile(userAppName) {
        const repo = this.getUserAppRepoDir(userAppName);

        return path.join(repo, "hooks/post-receive");
    }

    getAppTemplatePostReceiveHookFile(userAppName) {
        const repo = gitoliteUtils.getAppTemplateRepoDir(userAppName);

        return path.join(repo, "hooks/post-receive");
    }

    getSSHKeyDir(userId, sshKeyName) {
        return path.join(this.keydirPath, userId, sshKeyName);
    }

    getSSHKeyFile(userId, sshKeyName) {
        const dir = this.getSSHKeyDir(userId, sshKeyName);

        return path.join(dir, userId + ".pub");
    }

    async sync() {
        // Since sync is idempotent and stateless, we don't need to queue
        // more work if there is already a sync in queue.
        if (this.queue.getQueueLength() >= 2) {
            return;
        }

        await this.queue.add(async () => {
            await this._updateFiles();

            if (await this._adminRepoHasUncommitedChanges()) {
                await exec("git add .", { cwd: this.gitoliteAdminPath });
                await exec("git commit -m Update", {
                    cwd: this.gitoliteAdminPath
                });
            }

            if (await this._adminRepoHasUnpushedChanges()) {
                await exec(`${this.getGitoliteBinFile()} push origin master`, {
                    cwd: this.gitoliteAdminPath,
                    env: process.env
                });
            }
            await this._removeReposOfDeletedApps();

            await this._initializeRepos();
        });
    }

    async syncPeriodically(intervalMs = 1000, cb) {
        try {
            await this.sync();
            cb();
        } catch (err) {
            cb(err);
        }

        setTimeout(() => {
            this.syncPeriodically(intervalMs, cb);
        }, intervalMs);
    }

    async _adminRepoHasUncommitedChanges() {
        const gitStatus = await exec("git status -s", {
            cwd: this.gitoliteAdminPath
        });

        return !!gitStatus.stdout;
    }

    async _adminRepoHasUnpushedChanges() {
        await exec("git fetch", { cwd: this.gitoliteAdminPath });

        const gitRemoteCheck = await exec("git status -sb", {
            cwd: this.gitoliteAdminPath
        });

        return gitRemoteCheck.stdout.includes("ahead");
    }

    async _updateFiles() {
        // We need to clear SSH keys first in case users get deleted or they remove their SSH keys:
        await this._clearSSHKeys();
        await this._writeSSHKeys();
        await this._writeRepoConfig();
    }

    async _clearSSHKeys() {
        await fs.emptyDir(this.keydirPath);
    }

    async _writeSSHKeys() {
        const devs = await usersLib.findDevs();
        const admins = await usersLib.findAdmins();
        const users = [...devs, ...admins];

        for (const user of users) {
            for (const sshKey of user.sshKeys) {
                const publicKeyDir = this.getSSHKeyDir(user._id, sshKey.name);
                await fs.ensureDir(publicKeyDir);

                const publicKeyFile = this.getSSHKeyFile(user._id, sshKey.name);
                await fs.writeFile(publicKeyFile, sshKey.publicKey);
            }
        }
    }

    async _writeRepoConfig() {
        await fs.writeFile(
            this.gitoliteConfigPath,
            await this._getRepoConfig()
        );
    }

    // Gitolite docs: https://gitolite.com/gitolite/basic-admin.html#add-remove-and-rename-repos
    // File: this.gitoliteConfigPath = gitolite-admin/conf/gitolite.conf
    async _getRepoConfig() {
        const devs = await usersLib.findDevs();
        const admins = await usersLib.findAdmins();
        const userApps = await userAppsLib.getUserAppList();
        const appTemplates = await userAppsLib.getAppTemplatesList();

        let repoConfig = "";
        userApps.forEach(folderName => {
            const repoName = gitoliteUtils.getUserAppRepoName(folderName);
            repoConfig += `repo ${repoName}\n`;

            // Add all the devs that have access
            devs.forEach(dev => {
                if (dev.apps.includes(folderName)) {
                    repoConfig += `    RW+ = ${dev._id}\n`;
                }
            });

            // Admins have access to all apps
            admins.forEach(admin => {
                repoConfig += `    RW+ = ${admin._id}\n`;
            });
        });

        appTemplates.forEach(folderName => {
            const repoName = gitoliteUtils.getAppTemplateRepoName(folderName);
            repoConfig += `repo ${repoName}\n`;

            // Admins have access to all app templates
            admins.forEach(admin => {
                repoConfig += `    RW+ = ${admin._id}\n`;
            });
        });

        return repoConfig;
    }

    // Docs on removing repos: https://gitolite.com/gitolite/basic-admin.html#removingrenaming-a-repo
    // Basically just loop over all the repos and check if all of them have a corresponding user-app.
    // If not, delete that repo-dir.
    async _removeReposOfDeletedApps() {
        const repoNames = (await fs.readdir(this.gitoliteReposDir)).filter(
            repoName => !gitoliteUtils.GITOLITE_SYSTEM_REPOS.includes(repoName)
        );
        const userAppNames = await userAppsLib.getUserAppList();
        const userAppRepoNames = userAppNames.map(folderName => {
            return gitoliteUtils.getUserAppRepoName(folderName) + ".git";
        });
        const appTemplateNames = await userAppsLib.getAppTemplatesList();
        const appTemplateRepoNames = appTemplateNames.map(folderName => {
            return gitoliteUtils.getAppTemplateRepoName(folderName) + ".git";
        });

        for (const repoName of repoNames) {
            if (
                !userAppRepoNames.includes(repoName) &&
                !appTemplateRepoNames.includes(repoName)
            ) {
                await fs.remove(path.join(this.gitoliteReposDir, repoName));
            }
        }
    }

    async _initializeRepos() {
        const userApps = await userAppsLib.getUserAppList();
        for (const userAppName of userApps) {
            const repoDir = this.getUserAppRepoDir(userAppName);

            try {
                await exec("git log", { cwd: repoDir });
            } catch (err) {
                // If we catch an error that means repo has no commits,
                // so it wasn't initialized
                await this._pushInitialUserAppCommit(userAppName);
            }

            await this._writePostReceiveHook(userAppName);
        }

        const appTemplates = await userAppsLib.getAppTemplatesList();
        for (const appTemplateName of appTemplates) {
            const repoDir = gitoliteUtils.getAppTemplateRepoDir(
                appTemplateName
            );

            try {
                await exec("git log", { cwd: repoDir });
            } catch (err) {
                // If we catch an error that means repo has no commits,
                // so it wasn't initialized
                await this._pushInitialAppTemplateCommit(appTemplateName);
            }

            await this._writeAppTemplatePostReceiveHook(appTemplateName);
        }
    }

    async _pushInitialUserAppCommit(appName) {
        const bin = this.getGitoliteBinFile();
        const repo = this.getUserAppRepoDir(appName);

        await exec(`${bin} push ${repo} master`, {
            cwd: userAppsLib.getWorkingDir(appName),
            env: process.env
        });
    }

    async _pushInitialAppTemplateCommit(appName) {
        const bin = this.getGitoliteBinFile();
        const repo = gitoliteUtils.getAppTemplateRepoDir(appName);

        await exec(`${bin} push ${repo} master`, {
            cwd: userAppsLib.getAppTemplateWorkingDir(appName),
            env: process.env
        });
    }

    async _writePostReceiveHook(appName) {
        const hookFile = this.getUserAppPostReceiveHookFile(appName);

        await fs.writeFile(hookFile, userAppsLib.getPostReceiveScript(appName));
        await fs.chmod(hookFile, "755");
    }

    async _writeAppTemplatePostReceiveHook(folderName) {
        const hookFile = this.getAppTemplatePostReceiveHookFile(folderName);

        await fs.writeFile(
            hookFile,
            userAppsLib.getAppTemplatePostReceiveScript(folderName)
        );
        await fs.chmod(hookFile, "755");
    }
}

module.exports = GitoliteAdmin;
