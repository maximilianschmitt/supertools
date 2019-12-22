const joi = require("joi");
const usersLib = require("./lib");
const slackUtils = require("../../utils/slack-utils");
const validate = require("../../utils/validate");
const ClientError = require("../../errors/ClientError");

function UserAppsService(app) {
    app.use(usersLib.middlewares.authenticate);

    app.get("/logout", (req, res, next) => {
        req.session.userId = null;

        res.redirect("/");
    });

    app.post(
        "/signup",
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
                const user = await usersLib.signup({
                    username,
                    email,
                    password
                });

                req.session.userId = user._id;

                res.redirect("/");
            } catch (err) {
                next(err);
            }
        }
    );

    app.post("/login", async (req, res, next) => {
        const { email, password } = req.body;

        try {
            const user = await usersLib.login({ email, password });

            if (user) {
                req.session.userId = user._id;

                res.redirect("/");
            } else {
                throw new ClientError("Credentials are incorrect");
            }
        } catch (err) {
            next(err);
        }
    });

    app.get("/login", async (req, res) => {
        res.render("services/users/views/login");
    });

    app.get("/signup", async (req, res) => {
        res.render("services/users/views/signup");
    });

    app.get(
        "/signup/slack",
        slackUtils.slackLoginMiddleware(),
        async (req, res, next) => {
            try {
                const { slackAuthData, slackAuthError } = req;

                if (slackAuthError) {
                    console.error("Slack auth error", slackAuthError);
                    return res.redirect("/signup");
                }

                const slackToken = slackAuthData.access_token;
                const slackUserId = slackAuthData.user.id;
                const slackUserEmail = slackAuthData.user.email;
                const slackUserName = slackAuthData.user.name;
                const slackTeamId = slackAuthData.team.id;

                const user = await usersLib.signupWithSlack({
                    token: slackToken,
                    userId: slackUserId,
                    userName: slackUserName,
                    userEmail: slackUserEmail,
                    teamId: slackTeamId
                });

                req.session.userId = user._id;

                res.redirect("/");
            } catch (err) {
                next(err);
            }
        }
    );

    app.get(
        "/login/slack",
        slackUtils.slackLoginMiddleware(),
        async (req, res, next) => {
            try {
                const { slackAuthData, slackAuthError } = req;

                if (slackAuthError) {
                    console.error("Slack auth error", slackAuthError);
                    return res.redirect("/login");
                }

                const user = await usersLib.findUserBySlackUserId(
                    slackAuthData.user.id
                );

                if (!user) {
                    throw new ClientError(
                        "User not found. Sign up first or link your Slack account.",
                        { redirect: "/login" }
                    );
                }

                req.session.userId = user._id;

                res.redirect("/");
            } catch (err) {
                next(err);
            }
        }
    );
}

module.exports = UserAppsService;
