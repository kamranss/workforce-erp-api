const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PASSCODE_REGEX } = require('../models/User');

const PASSCODE_SALT_ROUNDS = 10;

function isValidRawPassCode(passCode) {
  return typeof passCode === 'string' && PASSCODE_REGEX.test(passCode);
}

async function hashPassCode(rawPassCode) {
  if (!isValidRawPassCode(rawPassCode)) {
    throw new Error('passCode must be exactly 6 numeric digits.');
  }

  return bcrypt.hash(rawPassCode, PASSCODE_SALT_ROUNDS);
}

function buildPassCodeLookup(rawPassCode) {
  if (!isValidRawPassCode(rawPassCode)) {
    throw new Error('passCode must be exactly 6 numeric digits.');
  }

  return crypto.createHash('sha256').update(rawPassCode).digest('hex');
}

async function comparePassCode(rawPassCode, passCodeHash) {
  if (!isValidRawPassCode(rawPassCode) || typeof passCodeHash !== 'string' || !passCodeHash) {
    return false;
  }

  return bcrypt.compare(rawPassCode, passCodeHash);
}

async function buildPassCodeCredentials(rawPassCode) {
  return {
    passCodeHash: await hashPassCode(rawPassCode),
    passCodeLookup: buildPassCodeLookup(rawPassCode)
  };
}

module.exports = {
  isValidRawPassCode,
  hashPassCode,
  buildPassCodeLookup,
  buildPassCodeCredentials,
  comparePassCode,
  PASSCODE_SALT_ROUNDS
};
