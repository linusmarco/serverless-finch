const Serverless = require('serverless');
const FinchClient = require('../index');

const BbPromise = require('bluebird');
jest.mock('bluebird');

const Confirm = require('prompt-confirm');
jest.mock('prompt-confirm');

const hlp = require('./resources/helpers');

const bucketUtils = require('../lib/bucketUtils');
jest.mock('../lib/bucketUtils');

const configure = require('../lib/configure');
jest.mock('../lib/configure');

const uploadDirectory = require('../lib/upload');
jest.mock('../lib/upload');

const validateClient = require('../lib/validate');
jest.mock('../lib/validate');

describe('Client', () => {
  let serverless;
  let pluginInstance;

  beforeEach(() => {
    serverless = new Serverless();
    pluginInstance = new FinchClient(serverless, undefined);
  });

  describe('#constructor()', () => {
    it('should set class properties correctly', () => {
      expect(pluginInstance.error).toEqual(serverless.classes.Error);
      expect(pluginInstance.serverless).toEqual(serverless);
      expect(pluginInstance.options).toEqual(serverless.service.custom.client);
    });

    it('should set the provider to AWS', () => {
      serverless.getProvider = jest.fn();
      pluginInstance = new FinchClient(serverless, undefined);

      expect(serverless.getProvider).toHaveBeenCalledTimes(1);
      expect(serverless.getProvider).toHaveBeenCalledWith('aws');
    });

    it('should set CLI options to passed object', () => {
      let cliOptions = {
        option1: 'whoop',
        option2: 'dee',
        option3: 'doo'
      };

      pluginInstance = new FinchClient(serverless, cliOptions);

      expect(pluginInstance.cliOptions).toEqual(cliOptions);
    });

    it('should default CLI options to empty object', () => {
      pluginInstance = new FinchClient(serverless, undefined);

      expect(pluginInstance.cliOptions).toEqual({});
    });

    describe('commands and hooks', () => {
      it('should define "client deploy" and "client remove" commands ONLY', () => {
        expect(Object.keys(pluginInstance.commands.client.commands)).toEqual(['deploy', 'remove']);
      });

      it('should set "deploy" lifecycle event for "deploy" command', () => {
        expect(pluginInstance.commands.client.commands.deploy.lifecycleEvents).toEqual(['deploy']);
      });

      it('should set "remove" lifecycle event for "remove" command', () => {
        expect(pluginInstance.commands.client.commands.remove.lifecycleEvents).toEqual(['remove']);
      });

      it('should run _processDeployment on "client deploy"', () => {
        pluginInstance._processDeployment = jest.fn();

        pluginInstance.hooks['client:deploy:deploy']();

        expect(pluginInstance._processDeployment).toHaveBeenCalledTimes(1);
      });

      it('should run _removeDeployedResources on "client remove"', () => {
        pluginInstance._removeDeployedResources = jest.fn();

        pluginInstance.hooks['client:remove:remove']();

        expect(pluginInstance._removeDeployedResources).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('#_validateConfig()', () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });

    it('should call validateClient once with the right params', () => {
      pluginInstance._validateConfig();

      expect(validateClient).toHaveBeenCalledTimes(1);
      expect(validateClient).toHaveBeenCalledWith(
        pluginInstance.serverless,
        pluginInstance.options
      );
    });

    it('should reject Bluebird promise if options invalid', () => {
      validateClient.mockImplementation(() => {
        throw ['fake error message'];
      });

      pluginInstance._validateConfig();

      expect(BbPromise.reject).toHaveBeenCalledTimes(1);
      expect(BbPromise.reject).toHaveBeenCalledWith(expect.stringContaining('fake error message'));
    });

    it('should do nothing if options valid', () => {
      validateClient.mockImplementation(() => undefined);
      pluginInstance.error = jest.fn();

      pluginInstance._validateConfig();

      expect(BbPromise.reject).toHaveBeenCalledTimes(0);
      expect(pluginInstance.error).toHaveBeenCalledTimes(0);
    });
  });

  describe('#_removeDeployedResources', () => {
    beforeEach(() => {
      jest.resetAllMocks();

      serverless = new Serverless();
      pluginInstance = new FinchClient(serverless, undefined);

      pluginInstance._validateConfig = jest.fn(() => Promise.resolve());
      pluginInstance.options = { bucketName: 'my-test-bucket' };
      pluginInstance.serverless = { cli: { log: jest.fn() } };
      pluginInstance.error = jest.fn();

      Confirm.mockImplementation(function() {
        this.run = jest.fn(() => Promise.resolve(true));
      });

      bucketUtils.bucketExists.mockImplementation(() => Promise.resolve(true));
      bucketUtils.emptyBucket.mockImplementation(() => Promise.resolve());
      bucketUtils.deleteBucket.mockImplementation(() => Promise.resolve());
    });

    it('should validate config', () => {
      return pluginInstance._removeDeployedResources().then(() => {
        expect(pluginInstance._validateConfig).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw error if config invalid', () => {
      pluginInstance._validateConfig = jest.fn(() => Promise.reject('Some error message'));

      return pluginInstance._removeDeployedResources().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(1);
        expect(pluginInstance.error).toHaveBeenCalledWith('Some error message');

        expect(Confirm).toHaveBeenCalledTimes(0);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(0);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(0);
        expect(bucketUtils.deleteBucket).toHaveBeenCalledTimes(0);
      });
    });

    it('should prompt user to confirm removal', () => {
      return pluginInstance._removeDeployedResources().then(() => {
        expect(Confirm).toHaveBeenCalledWith(
          `Are you sure you want to delete bucket '${pluginInstance.options.bucketName}'?`
        );
        expect(Confirm.mock.instances.length).toBe(1);
        expect(Confirm.mock.instances[0].run).toHaveBeenCalledTimes(1);
      });
    });

    it('should quit if user does not confirm', () => {
      Confirm.mockImplementation(function() {
        this.run = jest.fn(() => Promise.resolve(false));
      });

      return pluginInstance._removeDeployedResources().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(0);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(0);
        expect(bucketUtils.deleteBucket).toHaveBeenCalledTimes(0);
      });
    });

    it('should perform removal if user confirms', () => {
      return pluginInstance._removeDeployedResources().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(1);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(1);
        expect(bucketUtils.deleteBucket).toHaveBeenCalledTimes(1);
      });
    });

    it('should not do anything if bucket does not exist', () => {
      bucketUtils.bucketExists.mockImplementation(() => Promise.resolve(false));

      return pluginInstance._removeDeployedResources().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(1);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(0);
        expect(bucketUtils.deleteBucket).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe('#_processDeployment', () => {
    beforeEach(() => {
      jest.resetAllMocks();

      const validOptions = hlp.readTestConfig('valid/simple');

      serverless = new Serverless();
      pluginInstance = new FinchClient(serverless, undefined);

      pluginInstance._validateConfig = jest.fn(() => Promise.resolve());
      pluginInstance.options = validOptions.custom.client;
      pluginInstance.serverless = {
        cli: {
          log: jest.fn()
        },
        config: {
          servicePath: '/path/to/my/site'
        }
      };
      pluginInstance.error = jest.fn();

      Confirm.mockImplementation(function() {
        this.run = jest.fn(() => Promise.resolve(true));
      });

      bucketUtils.bucketExists.mockImplementation(() => Promise.resolve(true));
      bucketUtils.emptyBucket.mockImplementation(() => Promise.resolve());
      bucketUtils.createBucket.mockImplementation(() => Promise.resolve());
      configure.configureBucket.mockImplementation(() => Promise.resolve());
      configure.configurePolicyForBucket.mockImplementation(() => Promise.resolve());
      configure.configureCorsForBucket.mockImplementation(() => Promise.resolve());
      uploadDirectory.mockImplementation(() => Promise.resolve());
    });

    it('should validate config', () => {
      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance._validateConfig).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw error if config invalid', () => {
      pluginInstance._validateConfig = jest.fn(() => Promise.reject('Some error message'));

      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(1);
        expect(pluginInstance.error).toHaveBeenCalledWith('Some error message');

        expect(Confirm).toHaveBeenCalledTimes(0);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(0);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(0);
        expect(bucketUtils.createBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureBucket).toHaveBeenCalledTimes(0);
        expect(configure.configurePolicyForBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureCorsForBucket).toHaveBeenCalledTimes(0);
        expect(uploadDirectory).toHaveBeenCalledTimes(0);
      });
    });

    it('should prompt user to confirm deploy', () => {
      return pluginInstance._processDeployment().then(() => {
        expect(Confirm).toHaveBeenCalledWith('Do you want to proceed?');
        expect(Confirm.mock.instances.length).toBe(1);
        expect(Confirm.mock.instances[0].run).toHaveBeenCalledTimes(1);
      });
    });

    it('should quit if user does not confirm', () => {
      Confirm.mockImplementation(function() {
        this.run = jest.fn(() => Promise.resolve(false));
      });

      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(0);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(0);
        expect(bucketUtils.createBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureBucket).toHaveBeenCalledTimes(0);
        expect(configure.configurePolicyForBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureCorsForBucket).toHaveBeenCalledTimes(0);
        expect(uploadDirectory).toHaveBeenCalledTimes(0);
      });
    });

    it('should perform deployment if user confirms', () => {
      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(1);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(1);
        expect(bucketUtils.createBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureBucket).toHaveBeenCalledTimes(1);
        expect(configure.configurePolicyForBucket).toHaveBeenCalledTimes(1);
        expect(configure.configureCorsForBucket).toHaveBeenCalledTimes(1);
        expect(uploadDirectory).toHaveBeenCalledTimes(1);
      });
    });

    it('should create bucket (and not empty) if bucket does not exist', () => {
      bucketUtils.bucketExists.mockImplementation(() => Promise.resolve(false));

      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(1);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(0);
        expect(bucketUtils.createBucket).toHaveBeenCalledTimes(1);
        expect(configure.configureBucket).toHaveBeenCalledTimes(1);
        expect(configure.configurePolicyForBucket).toHaveBeenCalledTimes(1);
        expect(configure.configureCorsForBucket).toHaveBeenCalledTimes(1);
        expect(uploadDirectory).toHaveBeenCalledTimes(1);
      });
    });

    it('should not empty bucket if --no-delete-contents specified', () => {
      pluginInstance.cliOptions['delete-contents'] = false;

      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(1);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(0);
        expect(bucketUtils.createBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureBucket).toHaveBeenCalledTimes(1);
        expect(configure.configurePolicyForBucket).toHaveBeenCalledTimes(1);
        expect(configure.configureCorsForBucket).toHaveBeenCalledTimes(1);
        expect(uploadDirectory).toHaveBeenCalledTimes(1);
      });
    });

    it('should not configure bucket if --no-config-change specified', () => {
      pluginInstance.cliOptions['config-change'] = false;

      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(1);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(1);
        expect(bucketUtils.createBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureBucket).toHaveBeenCalledTimes(0);
        expect(configure.configurePolicyForBucket).toHaveBeenCalledTimes(1);
        expect(configure.configureCorsForBucket).toHaveBeenCalledTimes(1);
        expect(uploadDirectory).toHaveBeenCalledTimes(1);
      });
    });

    it('should not set bucket policy if --no-policy-change specified', () => {
      pluginInstance.cliOptions['policy-change'] = false;

      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(1);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(1);
        expect(bucketUtils.createBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureBucket).toHaveBeenCalledTimes(1);
        expect(configure.configurePolicyForBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureCorsForBucket).toHaveBeenCalledTimes(1);
        expect(uploadDirectory).toHaveBeenCalledTimes(1);
      });
    });

    it('should not set cors policy if --no-cors-change specified', () => {
      pluginInstance.cliOptions['cors-change'] = false;

      return pluginInstance._processDeployment().then(() => {
        expect(pluginInstance.error).toHaveBeenCalledTimes(0);

        expect(Confirm).toHaveBeenCalledTimes(1);
        expect(bucketUtils.bucketExists).toHaveBeenCalledTimes(1);
        expect(bucketUtils.emptyBucket).toHaveBeenCalledTimes(1);
        expect(bucketUtils.createBucket).toHaveBeenCalledTimes(0);
        expect(configure.configureBucket).toHaveBeenCalledTimes(1);
        expect(configure.configurePolicyForBucket).toHaveBeenCalledTimes(1);
        expect(configure.configureCorsForBucket).toHaveBeenCalledTimes(0);
        expect(uploadDirectory).toHaveBeenCalledTimes(1);
      });
    });
  });
});
