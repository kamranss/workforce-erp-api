const { sendMethodNotAllowed, sendSuccess } = require('../src/helpers/response');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendMethodNotAllowed(res, ['GET']);
  }

  return sendSuccess(res, {
    message: 'ArchBuild backend scaffold is up.',
    iteration: 'initialization'
  });
};
