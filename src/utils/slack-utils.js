const axios = require("axios");
const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET } = require("../config");

const slackUtils = {
    slackLoginMiddleware({ checkForSlackEnabled = true } = {}) {
        return async function(req, res, next) {
            try {
                const { team } = req;

                if (
                    checkForSlackEnabled &&
                    (!team.slack || !team.slack.signinEnabled)
                ) {
                    console.error("Slack not enabled");
                    return next();
                }

                const { code, error } = req.query;
                if (error) {
                    req.slackAuthError = error;

                    return next();
                }

                const slackRedirectURI =
                    req.protocol + "://" + req.get("host") + req.path;

                const { data: slackData } = await axios.get(
                    "https://slack.com/api/oauth.access",
                    {
                        params: {
                            client_id: SLACK_CLIENT_ID,
                            client_secret: SLACK_CLIENT_SECRET,
                            code,
                            redirect_uri: slackRedirectURI
                        }
                    }
                );

                if (!slackData.ok) {
                    console.error("Slack API response not ok");
                    req.slackAuthError = slackData.error;
                    return next();
                }

                if (
                    checkForSlackEnabled &&
                    (slackData.team && slackData.team.id !== team.slack.teamId)
                ) {
                    return next();
                }

                req.slackAuthData = slackData;

                next();
            } catch (err) {
                req.slackAuthError = err;
                next();
            }
        };
    }
};

module.exports = slackUtils;
