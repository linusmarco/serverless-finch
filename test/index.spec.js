const Serverless = require('serverless');
const FinchClient = require('../index');

const BbPromise = require('bluebird');
jest.mock('bluebird');

const Confirm = require('prompt-confirm');
jest.mock('prompt-confirm');

const hlp = require('./resources/helpers');

const bucketUtils = require('../lib/bucketUtils');
jest.mock('../lib/bucketUtils');

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
      validateClient.mockImplementation(() => 'fake error message');
      pluginInstance.error = jest.fn();

      pluginInstance._validateConfig();

      expect(BbPromise.reject).toHaveBeenCalledTimes(1);
      expect(pluginInstance.error).toHaveBeenCalledTimes(1);
      expect(pluginInstance.error).toHaveBeenCalledWith('fake error message');
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

      // serverless doesn't actually set options til hooks are called so need to set them here
      const simpleConfig = hlp.readTestConfig('valid/simple');
      pluginInstance.options = simpleConfig;
      pluginInstance._validateConfig = jest.fn();
      pluginInstance.error = jest.fn();

      Confirm.mockImplementation(function() {
        this.run = jest.fn(() => Promise.resolve(true));
      });
    });

    it('should validate config', () => {
      pluginInstance._removeDeployedResources();

      expect(pluginInstance._validateConfig).toHaveBeenCalledTimes(1);
    });

    it('should throw error if config invalid', () => {
      const simpleConfig = hlp.readTestConfig('invalid/badBucketName');
      pluginInstance.options = simpleConfig;

      expect(pluginInstance.error).toHaveBeenCalledTimes(1);
    });

    it('should prompt user to confirm removal', () => {
      pluginInstance._removeDeployedResources();

      expect(Confirm).toHaveBeenCalledWith(
        `Are you sure you want to delete bucket '${pluginInstance.options.bucketName}'?`
      );
      expect(Confirm.mock.instances.length).toBe(1);
      expect(Confirm.mock.instances[0].run).toHaveBeenCalledTimes(1);
    });

    // it('should wait 3 seconds before deleting', () => {});

    // it('should', () => {
    //   hlp.readTestConfig('valid/simple');
    // });
  });
});
