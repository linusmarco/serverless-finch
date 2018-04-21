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

  it('should throw an error if specified test config does not exist', () => {
    expect(() => {
      hlp.readTestConfig('THIS_IS_NOT_A_TEST_CONFIG');
    }).toThrow();
  });
});
