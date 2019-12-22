const fs = require("fs-extra");
const path = require("path");
const { TRASH_DIR } = require("../config");

const trash = {
    async moveToTrash(fileOrFolderPath) {
        return fs.move(
            fileOrFolderPath,
            path.join(
                TRASH_DIR,
                Date.now() + "_" + path.basename(fileOrFolderPath)
            )
        );
    }
};

module.exports = trash;
