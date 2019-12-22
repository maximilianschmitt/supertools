const crypto = require("crypto");
const DataStore = require("../../utils/DataStore");
const bcrypt = require("bcrypt");
const settingsLib = require("../settings/lib");
const NotPermittedError = require("../../errors/NotPermittedError");
const ClientError = require("../../errors/ClientError");

const db = new DataStore("users");

const usersLib = {
    middlewares: {
        async authenticate(req, res, next) {
            try {
                const { userId } = req.session;

                if (!userId) {
                    return next();
                }

                const user = await usersLib.findUserById(userId);

                req.user = user;
                res.locals.user = user;

                next();
            } catch (err) {
                next(err);
            }
        },

        requireUser(req, res, next) {
            if (!req.user) {
                return res.redirect("/login");
            }

            next();
        }
    },

    async getRoles() {
        return ["admin", "dev", "user"];
    },

    async signup({ username, email, password, slack = null }) {
        const userMaySignup = await settingsLib.userMaySignup({
            username,
            email,
            password,
            slack
        });

        if (!userMaySignup) {
            throw new NotPermittedError();
        }

        const userWithSameUserName = await this.findUserByUsername(username);
        if (userWithSameUserName) {
            throw new ClientError(
                `A user with username "${username}" exists already`
            );
        }

        const userWithSameEmail = await this.findUserByEmail(email);
        if (userWithSameEmail) {
            throw new ClientError(
                `A user with email "${email}" exists already`
            );
        }

        const user = await this.unsafeCreate({
            username,
            email,
            password,
            slack
        });

        return user;
    },

    async unsafeCreate({
        username,
        email,
        password,
        hashedPassword,
        slack = null,
        createdAt = new Date(),
        apps = [],
        sshKeys = [],
        role = "user"
    }) {
        hashedPassword = hashedPassword || (await bcrypt.hash(password, 12));

        const user = await db.insert({
            username,
            email,
            hashedPassword,
            role,
            apps,
            createdAt,
            sshKeys,
            slack
        });

        return usersLib.stripHiddenFields(user);
    },

    async login({ email, password }) {
        const user = await db.findOne({ email });

        if (!user) {
            return null;
        }

        const passwordsMatch = await bcrypt.compare(
            password,
            user.hashedPassword
        );

        if (passwordsMatch) {
            return usersLib.stripHiddenFields(user);
        }

        return null;
    },

    async findUserById(userId) {
        return usersLib.stripHiddenFields(await db.findOne({ _id: userId }));
    },

    async findUserByUsername(username) {
        return usersLib.stripHiddenFields(await db.findOne({ username }));
    },

    async findUserByEmail(email) {
        return usersLib.stripHiddenFields(await db.findOne({ email }));
    },

    async findUsers() {
        const users = await db.find({});

        return users.map(usersLib.stripHiddenFields);
    },

    async findUsersWithAccessToApp(folderName) {
        const users = await db.find({
            $or: [{ role: "admin" }, { apps: folderName }]
        });

        return users.map(usersLib.stripHiddenFields);
    },

    async findDevs() {
        const users = await db.find({ role: "dev" });

        return users.map(usersLib.stripHiddenFields);
    },

    async findAdmins() {
        const users = await db.find({ role: "admin" });

        return users.map(usersLib.stripHiddenFields);
    },

    async updateUser(userId, data) {
        if (data.password) {
            const hashedPassword = await bcrypt.hash(data.password, 12);
            data.hashedPassword = hashedPassword;
        }
        delete data.password;

        if (typeof data.apps === "string") {
            data.apps = [data.apps];
        }

        if (data.username) {
            const userWithSameUserName = await this.findUserByUsername(
                data.username
            );
            if (userWithSameUserName && userWithSameUserName._id !== userId) {
                throw new ClientError(
                    `Another user with username "${data.username}" exists already`
                );
            }
        }

        if (data.email) {
            const userWithSameEmail = await this.findUserByEmail(data.email);
            if (userWithSameEmail && userWithSameEmail._id !== userId) {
                throw new ClientError(
                    `Another user with email "${data.email}" exists already`
                );
            }
        }

        await db.update({ _id: userId }, { $set: data });
    },

    async addSSHKeyToUser(userId, { publicKey, name }) {
        const sshKeyWithSameName = await db.findOne({
            _id: userId,
            "sshKeys.name": name
        });

        if (sshKeyWithSameName) {
            throw new ClientError(
                `Another SSH key with the name "${name}" already exists`
            );
        }

        await db.update(
            { _id: userId },
            {
                $addToSet: {
                    sshKeys: {
                        id: String(Date.now()),
                        publicKey,
                        name,
                        createdAt: new Date()
                    }
                }
            }
        );
    },

    async removeSSHKeyFromUser(userId, sshKeyId) {
        await db.update(
            { _id: userId },
            { $pull: { sshKeys: { id: sshKeyId } } }
        );
    },

    async signupWithSlack({
        token,
        userId: slackUserId,
        userName,
        userEmail,
        teamId
    }) {
        const randomPassword = await new Promise((resolve, reject) => {
            crypto.randomBytes(48, (err, buffer) => {
                if (err) {
                    return reject(err);
                }

                resolve(buffer.toString("hex"));
            });
        });

        const existingUser = await usersLib.findUserBySlackUserId(slackUserId);

        if (existingUser) {
            return existingUser;
        }

        return usersLib.signup({
            username: userName,
            email: userEmail,
            password: randomPassword,
            slack: {
                token,
                userId: slackUserId,
                userName,
                userEmail,
                teamId
            }
        });
    },

    async linkSlack(
        userId,
        { token, userId: slackUserId, userName, userEmail, teamId }
    ) {
        await usersLib.updateUser(userId, {
            slack: {
                token,
                userId: slackUserId,
                userName,
                userEmail,
                teamId
            }
        });
    },

    async unlinkSlack(userId) {
        await usersLib.updateUser(userId, { slack: null });
    },

    async findUserBySlackUserId(slackUserId) {
        return db.findOne({ "slack.userId": slackUserId });
    },

    async deleteUser(userId) {
        await db.remove({ _id: userId });
    },

    stripHiddenFields(user) {
        if (!user) {
            return null;
        }

        delete user.hashedPassword;

        return user;
    },

    async restrictAppToUsers(folderName, userIds) {
        await db.update(
            { _id: { $in: userIds } },
            { $addToSet: { apps: folderName } },
            { multi: true }
        );
        await db.update(
            { _id: { $nin: userIds } },
            { $pull: { apps: folderName } },
            { multi: true }
        );
    },

    async removeAppFromAllUsers(folderName) {
        await db.update(
            { apps: folderName },
            { $pull: { apps: folderName } },
            { multi: true }
        );
    },

    async mayUserAccessApp(user, folderName) {
        return user.role === "admin" || user.apps.includes(folderName);
    }
};

module.exports = usersLib;
