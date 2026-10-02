'use strict';

const util = require('./util');

function createCryptoHttp({ platform = process.platform, env = process.env, fetchJson = util.fetchJson, windowsFetch } = {}) {
  const useWindowsTransport = platform === 'win32' && !env.VERCEL;
  let transport = null;
  if (useWindowsTransport) {
    transport = windowsFetch || require('./windows-fetch').windowsFetch;
  }
  return {
    fetchJson(url, options = {}) {
      return fetchJson(url, transport ? Object.assign({}, options, { transport }) : options);
    },
  };
}

const defaultHttp = createCryptoHttp();
module.exports = { createCryptoHttp, fetchJson: defaultHttp.fetchJson };
