require("dotenv").config();
const express = require("express");
const path = require("path");
const http = require("http");
const bodyParser = require("body-parser");

const { PORT, MAIN_FILE } = process.env;

const app = express();

app.set("view engine", "pug");
app.set("views", "src/views");

app.use(bodyParser.urlencoded({ extended: true }));

app.get("/__status", (req, res) => {
    res.status(200).json({
        folderName: path.basename(process.cwd())
    });
});

app.get("/supertools.css", (req, res) => {
    res.type("css");
    const connector = http.request(
        {
            host: "localhost",
            port: 3333,
            path: "/public/styles/supertools.css",
            method: "GET"
        },
        resp => {
            resp.pipe(res);
        }
    );

    req.pipe(connector);
});

require(path.resolve(process.cwd(), MAIN_FILE))(app);

app.listen(PORT, err => {
    if (err) {
        throw err;
    }

    process.send("ready");
    console.log("Listening on port", PORT);
});
