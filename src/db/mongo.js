const mongoose = require('mongoose');
const { config } = require('../config/env');

const globalCache = global;

if (!globalCache.__mongooseCache) {
  globalCache.__mongooseCache = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (globalCache.__mongooseCache.conn) {
    return globalCache.__mongooseCache.conn;
  }

  if (!globalCache.__mongooseCache.promise) {
    const options = {
      dbName: config.mongodbDbName,
      bufferCommands: false
    };

    globalCache.__mongooseCache.promise = mongoose
      .connect(config.mongodbUri, options)
      .then((mongooseInstance) => mongooseInstance.connection);
  }

  globalCache.__mongooseCache.conn = await globalCache.__mongooseCache.promise;
  return globalCache.__mongooseCache.conn;
}

module.exports = {
  connectToDatabase
};
