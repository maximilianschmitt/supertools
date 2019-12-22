const NeDBDataStore = require("nedb");
const path = require("path");
const util = require("util");
const config = require("../config");

const { DATA_DIR } = config;
const DATA_STORES_DIR = path.resolve(DATA_DIR, "stores");

class DataStore extends NeDBDataStore {
    constructor(collectionName) {
        super({
            filename: path.resolve(DATA_STORES_DIR, collectionName),
            autoload: true
        });

        this.insert = util.promisify(this.insert).bind(this);
        this.find = util.promisify(this.find).bind(this);
        this.findOne = util.promisify(this.findOne).bind(this);
        this.update = util.promisify(this.update).bind(this);
        this.count = util.promisify(this.count).bind(this);
    }
}

module.exports = DataStore;
