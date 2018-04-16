const fs = require('fs');
const path = require('path');

const yaml = require('js-yaml');

function readTestConfig(configPath) {
  const configPathAbsolute = fs.readFileSync(
    path.join(__dirname, 'samples', path.normalize(configPath), 'serverless.yml')
  );

  return yaml.safeLoad(configPathAbsolute);
}

module.exports = {
  readTestConfig
};
