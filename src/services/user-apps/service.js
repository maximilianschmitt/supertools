const joi = require("joi");
const userAppsLib = require("./lib");
const usersLib = require("../users/lib");
const confirmAction = require("../../utils/confirm-action-middleware");
const validate = require("../../utils/validate");

function UserAppsService(app) {
    app.post(
        "/user-apps",
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
                        return "App names must be at least 2 characters long";
                    }

                    if (err.type === "string.max") {
                        return "App names can be at most 32 characters long";
                    }

                    if (err.type === "string.regex.base") {
                        return "App names must start and begin with alpha-numeric characters";
                    }

                    return "Please provide a valid app name";
                }),
            appTemplateFolderName: joi
                .string()
                .trim()
                .allow("")
        }),
        async (req, res, next) => {
            try {
                const { user } = req;

                if (user.role === "user") {
                    return res.redirect("/");
                }

                const { folderName, appTemplateFolderName } = req.body;

                const userApp = await userAppsLib.createUserAppDir({
                    folderName,
                    appTemplateFolderName
                });

                await userAppsLib.isUserAppValid(userApp.folderName);

                if (user.role === "dev") {
                    await usersLib.restrictAppToUsers(userApp.folderName, [
                        user._id
                    ]);
                }

                res.redirect(`/user-apps/${userApp.folderName}`);
            } catch (err) {
                next(err);
            }
        }
    );

    async function getBaseViewData({ user, folderName }) {
        const userApps = (await userAppsLib.getUserApps()).filter(
            userApp =>
                user.role === "admin" || user.apps.includes(userApp.folderName)
        );

        const appTemplates = await userAppsLib.getAppTemplates();

        const selectedFolderName =
            folderName || (userApps[0] && userApps[0].folderName);

        const userApp = userApps.find(
            userApp => userApp.folderName === selectedFolderName
        );

        return {
            section: "user-apps",
            selectedFolderName,
            userApp,
            userApps,
            appTemplates,
            otherUsers: (await usersLib.findUsers()).filter(
                otherUser => otherUser._id !== user._id
            ),
            otherUsersWithAccess: (await usersLib.findUsersWithAccessToApp(
                selectedFolderName
            )).filter(otherUser => otherUser._id !== user._id),
            canCreateApps: user.role !== "user",
            canEditSecrets: user.role === "admin",
            canDeleteApps: user.role === "admin",
            isDev: user.role !== "user",
            canManageUsers: user.role === "admin"
        };
    }

    app.get(
        ["/", "/user-apps", "/user-apps/:folderName"],
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user } = req;
                const { folderName } = req.params;

                if (
                    folderName &&
                    user.role !== "admin" &&
                    !user.apps.includes(folderName)
                ) {
                    return res.redirect("/");
                }

                const viewData = await getBaseViewData({ user, folderName });

                res.render("services/user-apps/views/index", viewData);
            } catch (err) {
                next(err);
            }
        }
    );

    app.post(
        "/user-apps/:folderName/secrets",
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user } = req;
                const { folderName } = req.params;
                const { secrets } = req.body;

                if (user.role !== "admin") {
                    return res.redirect("/");
                }

                await userAppsLib.writeSecrets(folderName, secrets);

                res.redirect(`/user-apps/${folderName}`);
            } catch (err) {
                next(err);
            }
        }
    );
    app.get(
        "/user-apps/:folderName/secrets",
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user } = req;
                const { folderName } = req.params;

                if (user.role !== "admin") {
                    return res.redirect("/");
                }

                const viewData = await getBaseViewData({ user, folderName });
                viewData.secrets = await userAppsLib.getSecrets(folderName);

                res.render(
                    "services/user-apps/views/edit-app-secrets",
                    viewData
                );
            } catch (err) {
                next(err);
            }
        }
    );

    app.get(
        "/user-apps/:folderName/log",
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user } = req;
                const { folderName } = req.params;

                if (
                    !(
                        user.role === "admin" ||
                        (user.role === "dev" && user.apps.includes(folderName))
                    )
                ) {
                    return res.redirect("/user-apps/:folderName");
                }

                userAppsLib.getLogStream(folderName).pipe(res);
            } catch (err) {
                next(err);
            }
        }
    );

    app.post(
        "/user-apps/:folderName/users",
        usersLib.middlewares.requireUser,
        async (req, res, next) => {
            try {
                const { user } = req;
                const { folderName } = req.params;
                const { users } = req.body;

                if (user.role !== "admin") {
                    return res.redirect("/");
                }

                if (typeof users === "string") {
                    await usersLib.restrictAppToUsers(folderName, [users]);
                } else if (Array.isArray(users)) {
                    await usersLib.restrictAppToUsers(folderName, users);
                } else {
                    await usersLib.restrictAppToUsers(folderName, []);
                }

                res.redirect("/user-apps/" + folderName);
            } catch (err) {
                next(err);
            }
        }
    );

    app.post(
        "/user-apps/:folderName/delete",
        usersLib.middlewares.requireUser,
        confirmAction(req => ({
            title: `Are you sure you want to delete the app "${req.params.folderName}"?`,
            confirmButtonText: "Delete app",
            backLink: `/user-apps/${req.params.folderName}`
        })),
        async (req, res, next) => {
            try {
                const { user } = req;
                const { folderName } = req.params;

                if (user.role !== "admin") {
                    return res.redirect(`/user-apps/${folderName}`);
                }

                await userAppsLib.deleteApp(folderName);

                res.redirect("/user-apps");
            } catch (err) {
                next(err);
            }
        }
    );
}

module.exports = UserAppsService;
