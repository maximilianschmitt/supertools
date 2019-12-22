const pm2 = require("pm2");

async function connectPm2() {
    console.log("Connecting to PM2...");

    return new Promise((resolve, reject) => {
        pm2.connect(err => {
            if (err) {
                return reject(err);
            }

            resolve(pm2);
        });
    });
}

module.exports = connectPm2;
