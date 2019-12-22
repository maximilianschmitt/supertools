const gitoliteUtils = {
    GITOLITE_SYSTEM_REPOS: ["gitolite-admin.git", "testing.git"],

    getUserAppRepoName(folderName) {
        if (this.GITOLITE_SYSTEM_REPOS.includes(folderName + ".git")) {
            return folderName + ".app";
        }

        return folderName;
    },

    getAppTemplateRepoName(folderName) {
        return folderName + ".template";
    },

    getAppTemplateRepoDir(folderName) {
        const repoName = this.getAppTemplateRepoName(folderName);

        return `/home/git/repositories/${repoName}.git`;
    }
};

module.exports = gitoliteUtils;
