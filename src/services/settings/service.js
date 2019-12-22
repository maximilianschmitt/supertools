const validator = require("validator");
const joi = require("joi");
const usersLib = require("../users/lib");
const userAppsLib = require("../user-apps/lib");
const settingsLib = require("./lib");
const confirmAction = require("../../utils/confirm-action-middleware");
const slackUtils = require("../../utils/slack-utils");
const ClientError = require("../../errors/ClientError");
const validate = require("../../utils/validate");

function SettingsService(app) {
    app.post(
        "/settings/users",
        usersLib.middlewares.requireUser,
        confirmAction(req => ({
            title: "Are you sure you want to delete this user?",
            confirmButtonText: "Delete user",
            backLink: `/settings/users`,
            when: () => !!req.body.deleteUserId
        })),
        async (req, res, next) => {
            try {
                const { user } = req;
                const { saveRoles, deleteUserId, users } = req.body;

                if (saveRoles) {
                    if (user.role !== "admin") {
                        throw new ClientError("Only admins can change roles");
                    }

                    const updates = Object.entries(users).map(
                        ([userId, updateSet]) => {
                            // Don't change apps of admins
                            if (updateSet.role === "admin") {
                                delete updateSet.apps;
                            }

                            return usersLib.updateUser(userId, updateSet);
                        }
                    );

                    await Promise.all(updates);
                } else if (deleteUserId) {
                    if (user.role !== "admin") {
                        throw new ClientError("Only admins can delete users");
                    }

                    if (user._id === deleteUserId) {
                        throw new ClientError("You cannot delete yourself");
                    }

                    await usersLib.deleteUser(deleteUserId);
                }

                res.redirect("/settings/users");
            } catch (err) {
                next(err);
            }
        }
    );

    app.post(
        "/settings/users/new",
        usersLib.middlewares.requireUser,
        validate.body({
            username: joi
                .string()
                .trim()
                .token()
                .min(2)
                .max(32)
                .label("Username"),
            email: joi
                .string()
                .trim()
                .email()
                .lowercase()
                .label("Email"),
            password: joi
                .string()
                .min(8)
                .label("Password")
        }),
        async (req, res, next) => {
            const { username, email, password } = req.body;

            try {
                await usersLib.signup({
                    username,
                    email,
                    password
                });

                res.redirect("/settings/users");
            } catch (err) {
                next(err);
            }
        }
    );

    app.get(
        "/settings/users/new",
        usersLib.middlewares.requireUser,
        (req, res, next) => {
            res.render("services/settings/views/create-user");
        }
    );

    app.post(
        "/settings/users/:userId",
        usersLib.middlewares.requireUser,
        validate.body({
            username: joi
                .string()
                .trim()
                .token()
                .min(2)
                .max(32)
                .label("Username"),
            email: joi
                .string()
                .trim()
                .email()
                .lowercase()
                .label("Email"),
            password: joi
                .string()
                .min(8)
                .allow("")
                .label("Password")
        }),
        async (req, res, next) => {
            try {
                const { user } = req;
                const { userId } = req.params;

                if (user._id !== userId && user.role !== "admin") {
                    return res.redirect("settings");
                }

                const { username, email, password } = req.body;

                await usersLib.updateUser(userId, {
                    username,
                    email,
                    password
                });

                res.redirect("back");
            } catch (err) {
                next(err);
            }
        }
    );

    app.get(
        "/settings/account/slack/link",
        usersLib.middlewares.requireUser,
        slackUtils.slackLoginMiddleware(),
        async (req, res, next) => {
            try {
                const { user, slackAuthData, slackAuthError } = req;

                if (slackAuthError) {
                    console.error("Slack auth error", slackAuthError);
                    return res.redirect("/settings/account");
                }

                const slackToken = slackAuthData.access_token;
                const slackUserId = slackAuthData.user.id;
                const slackUserEmail = slackAuthData.user.email;
                const slackUserName = slackAuthData.user.name;
                const slackTeamId = slackAuthData.team.id;

                await usersLib.linkSlack(user._id, {
                    token: slackToken,
                    userId: slackUserId,
                    userName: slackUserName,
                    userEmail: slackUserEmail,
                    teamId: slackTeamId
                });

                res.redirect("/settings/account");
            } catch (err) {
                next(err);
            }
        }
    );
    app.post(
        "/settings/account/slack/unlink",
        usersLib.middlewares.requireUser,
        confirmAction(req => ({
            title: "Are you sure you want to unlink your Slack account?",
            confirmButtonText: "Unlink Slack account",
            backLink: `/settings/account`
        })),
        async (req, res, next) => {
            try {
                const { user } = req;

                await usersLib.unlinkSlack(user._id);

                res.redirect("/settings/account");
            } catch (err) {
                next(err);
            }
        }
    );
    app.get("/settings", usersLib.middlewares.requireUser, (req, res) => {
        res.redirect("/settings/users");
    });

    app.get(
        "/settings/account",
        usersLib.middlewares.requireUser,
        async (req, res) => {
            const viewData = {
                section: "settings"
            };

            res.render("services/settings/views/account", viewData);
        }
    );

    app.get(
        "/settings/ssh-keys",
        usersLib.middlewares.requireUser,
        async (req, res) => {
            const viewData = {
                section: "settings"
            };

            res.render("services/settings/views/ssh-keys", viewData);
        }
    );

    app.post(
        "/settings/ssh-keys",
        usersLib.middlewares.requireUser,
        validate.body({
            publicKey: joi
                .string()
                .trim()
                .label("Public key"),
            name: joi
                .string()
                .trim()
                .min(2)
                .token()
                .label("Key name")
        }),
        async (req, res, next) => {
            try {
                const { user } = req;

                const { publicKey, name } = req.body;

                await usersLib.addSSHKeyToUser(user._id, {
                    publicKey,
                    name
                });

                res.redirect("back");
            } catch (err) {
                next(err);
            }
        }
    );

    app.post(
        "/settings/ssh-keys/:sshKeyId/remove",
        usersLib.middlewares.requireUser,
        confirmAction(req => ({
            title: "Are you sure you want to remove this SSH key?",
            confirmButtonText: "Remove SSH key",
            backLink: "/settings/ssh-keys",
            when: () => req.body.removeSSHKey != null
        })),
        async (req, res, next) => {
            try {
                const { user } = req;
                const { sshKeyId } = req.params;

                await usersLib.removeSSHKeyFromUser(user._id, sshKeyId);

                res.redirect("/settings/ssh-keys");
            } catch (err) {
                next(err);
            }
        }
    );

    app.get(
        "/settings/general/slack/enable",
        usersLib.middlewares.requireUser,
        slackUtils.slackLoginMiddleware({ checkForSlackEnabled: false }),
        async (req, res, next) => {
            try {
                const { user, slackAuthData, slackAuthError } = req;

                if (user.role !== "admin") {
                    return res.redirect("/settings");
                }

                if (typeof slackAuthError === "string" && slackAuthError) {
                    req.flash("errorMessages", "Slack: " + slackAuthError);
                    return res.redirect("/settings/general");
                } else if (slackAuthError) {
                    console.error(slackAuthError);
                    req.flash(
                        "errorMessages",
                        "There was an error enabling Slack. Check server logs for details."
                    );
                    return res.redirect("/settings/general");
                }

                const slackToken = slackAuthData.access_token;
                const slackUserId = slackAuthData.user.id;
                const slackUserEmail = slackAuthData.user.email;
                const slackUserName = slackAuthData.user.name;
                const slackTeamId = slackAuthData.team.id;
                const slackTeamName = slackAuthData.team.name;
                const slackTeamDomain = slackAuthData.team.domain;

                await settingsLib.enableSlackSignin({
                    teamId: slackTeamId,
                    teamName: slackTeamName,
                    teamDomain: slackTeamDomain
                });

                await usersLib.linkSlack(user._id, {
                    token: slackToken,
                    userId: slackUserId,
                    userName: slackUserName,
                    userEmail: slackUserEmail,
                    teamId: slackTeamId
                });

                res.redirect("/settings/general");
            } catch (err) {
                next(err);
            }
        }
    );
    app.post(
        "/settings/general/slack/remove",
        usersLib.middlewares.requireUser,
        confirmAction(req => ({
            title: `Are you sure you want to remove Slack-Signin?`,
            confirmButtonText: "Remove Slack-Signin",
            backLink: `/settings/general`
        })),
        async (req, res, next) => {
            try {
                const { user } = req;

                if (user.role !== "admin") {
                    return res.redirect("/settings");
                }

                await settingsLib.removeSlackSignin();

                res.redirect("/settings/general");
            } catch (err) {
                next(err);
            }
        }
    );
    app.post(
        "/settings/general",
        usersLib.middlewares.requireUser,
        validate.body({
            teamName: joi
                .string()
                .trim()
                .min(2)
                .label("Team name")
        }),
        async (req, res, next) => {
            const { user } = req;
            const { teamName } = req.body;

            if (user.role !== "admin") {
                return res.redirect("/settings");
            }

            await settingsLib.setTeamName(teamName);

            res.redirect("/settings/general");
        }
    );
    app.get(
        "/settings/general",
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user, team } = req;

                const viewData = {
                    section: "settings",
                    canEdit: user.role === "admin",
                    slackSigninEnabled: team.slack
                        ? team.slack.signinEnabled
                        : false,
                    npmrc: await settingsLib.readNpmrc()
                };

                res.render(
                    "services/settings/views/general-settings",
                    viewData
                );
            } catch (err) {
                next(err);
            }
        }
    );

    app.get(
        "/settings/users",
        usersLib.middlewares.requireUser,
        async (req, res) => {
            const { user } = req;

            const viewData = {
                section: "settings",
                canEditUsersAndRoles: user.role === "admin",
                users: await usersLib.findUsers(),
                userApps: await userAppsLib.getUserApps(),
                roles: await usersLib.getRoles()
            };

            res.render("services/settings/views/users-roles", viewData);
        }
    );

    app.get(
        "/settings/users/:userId/edit",
        usersLib.middlewares.requireUser,
        async (req, res) => {
            const { user } = req;
            const { userId } = req.params;

            if (user.role !== "admin") {
                return res.redirect("/settings/users");
            }

            const userToEdit = await usersLib.findUserById(userId);

            if (!userToEdit) {
                return res.redirect("/settings/users");
            }

            const viewData = {
                section: "settings",
                userToEdit
            };

            res.render("services/settings/views/edit-user", viewData);
        }
    );

    app.post(
        "/settings/app-templates/:folderName/delete",
        usersLib.middlewares.requireUser,
        confirmAction(req => ({
            title: `Are you sure you want to delete the app template "${req.params.folderName}"?`,
            confirmButtonText: "Delete app template",
            backLink: `/settings/app-templates/${req.params.folderName}`
        })),
        async (req, res, next) => {
            try {
                const { user } = req;
                const { folderName } = req.params;

                if (user.role !== "admin") {
                    return res.redirect("/settings");
                }

                await userAppsLib.deleteAppTemplate(folderName);

                res.redirect("/settings/app-templates");
            } catch (err) {
                next(err);
            }
        }
    );
    app.post(
        "/settings/app-templates",
        usersLib.middlewares.requireUser,
        validate.body({
            folderName: joi
                .string()
                .trim()
                .min(2)
                .max(32)
                .regex(/^[a-z0-9].*[a-z0-9]/i)
                .error(errors => {
                    const err = errors[0];

                    if (err.type === "string.min") {
                        return "App template names must be at least 2 characters long";
                    }

                    if (err.type === "string.max") {
                        return "App template names can be at most 32 characters long";
                    }

                    if (err.type === "string.regex.base") {
                        return "App template names must start and begin with alpha-numeric characters";
                    }

                    return "Please provide a valid app template name";
                })
        }),
        async (req, res, next) => {
            try {
                const { user } = req;
                const { folderName } = req.body;

                if (user.role !== "admin") {
                    return res.redirect("/settings");
                }

                await userAppsLib.createAppTemplate({ folderName });

                res.redirect("/settings/app-templates");
            } catch (err) {
                next(err);
            }
        }
    );
    app.get(
        "/settings/app-templates",
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user } = req;

                if (user.role !== "admin") {
                    return res.redirect("/settings");
                }

                const viewData = {
                    section: "settings",
                    appTemplates: await userAppsLib.getAppTemplates()
                };

                res.render("services/settings/views/app-templates", viewData);
            } catch (err) {
                next(err);
            }
        }
    );

    app.post(
        "/settings/general/signup-email-domains",
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user } = req;

                if (user.role !== "admin") {
                    return res.redirect("/settings/general");
                }

                const { signupEmailDomains: signupEmailDomainsRaw } = req.body;

                const signupEmailDomains = (signupEmailDomainsRaw || "")
                    .split(/,|;|\n/)
                    .map(line => line.trim())
                    .filter(hostname => validator.isEmail("test@" + hostname));

                await settingsLib.setSignupEmailDomains(signupEmailDomains);

                res.redirect("/settings/general");
            } catch (err) {
                next(err);
            }
        }
    );

    app.post(
        "/settings/general/npmrc",
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user } = req;

                if (user.role !== "admin") {
                    return res.redirect("/settings/general");
                }

                const { npmrc } = req.body;

                await settingsLib.writeNpmrc(npmrc);

                res.redirect("/settings/general");
            } catch (err) {
                next(err);
            }
        }
    );
}

module.exports = SettingsService;
