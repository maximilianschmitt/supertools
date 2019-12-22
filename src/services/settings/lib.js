const fs = require("fs-extra");
const path = require("path");
const extractDomain = require("extract-domain");
const DataStore = require("../../utils/DataStore");

const db = new DataStore("team");

const settingsLib = {
    async getTeam() {
        const team = await db.findOne({});

        return team;
    },

    async updateTeam(newValues) {
        return db.update({}, { $set: newValues }, { upsert: true });
    },

    async getTeamName() {
        const team = await settingsLib.getTeam();

        if (team) {
            return team.name;
        }

        return "";
    },

    async setTeamName(teamName) {
        await settingsLib.updateTeam({ name: teamName });
    },

    async getSlackSettings() {
        const team = await settingsLib.getTeam();

        if (team) {
            return team.slack;
        }

        return null;
    },

    async enableSlackSignin({ teamId, teamName, teamDomain }) {
        await settingsLib.updateTeam({
            slack: { signinEnabled: true, teamId, teamName, teamDomain }
        });
    },

    async removeSlackSignin() {
        await settingsLib.updateTeam({ slack: null });
    },

    async setSignupEmailDomains(signupEmailDomains = []) {
        await settingsLib.updateTeam({ signupEmailDomains });
    },

    async userMaySignup({ email }) {
        const team = await settingsLib.getTeam();

        if (!team.signupEmailDomains) {
            return true;
        }

        if (team.signupEmailDomains.length === 0) {
            return true;
        }

        const emailDomain = extractDomain(email);

        return team.signupEmailDomains.includes(emailDomain);
    },

    getNpmrcFile() {
        return path.resolve(process.cwd(), ".npmrc");
    },

    async writeNpmrc(content) {
        await fs.ensureFile(settingsLib.getNpmrcFile());
        await fs.writeFile(settingsLib.getNpmrcFile(), content, "utf8");
    },

    async readNpmrc() {
        try {
            const npmrc = await fs.readFile(settingsLib.getNpmrcFile(), "utf8");

            return npmrc;
        } catch (err) {
            if (err.code === "ENOENT") {
                return "";
            }

            throw err;
        }
    }
};

module.exports = settingsLib;
