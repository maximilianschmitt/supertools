const GitoliteAdmin = require("./utils/GitoliteAdmin");
const config = require("./config");

const gitoliteAdmin = new GitoliteAdmin({
    gitoliteAdminPath: config.GITOLITE_ADMIN_PATH,
    gitoliteReposDir: config.GITOLITE_REPOSITORIES_PATH
});

module.exports = gitoliteAdmin;
