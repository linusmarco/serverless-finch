const hlp = require('./helpers');

describe('#readTestConfig', () => {
  it('should read the config correctly', () => {
    const testCfg = hlp.readTestConfig('valid/simple');

    expect(testCfg).toEqual({
      service: 'valid-simple',
      provider: {
        name: 'aws',
        region: 'us-east-1'
      },
      plugins: ['serverless-finch'],
      custom: {
        client: {
          bucketName: 'valid-simple'
        }
      }
    });
  });
});
