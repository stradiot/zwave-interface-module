const sqlite = require('sqlite-module');
const mqtt = require('mqtt-module');
const R = require('ramda');
const { EventEmitter } = require('events');

class ZwaveInterface extends EventEmitter  {
    constructor() {
        super();
    }

    resolveMqtt(message) {
        const resolveDriverFailed = (moduleId) => {
          console.error(`Z-Wave driver failed on module ${moduleId}`);
        };

        const resolveNodeAdded = (moduleId, data) => {
          const result = sqlite.addZwaveDevice({ ...data, moduleId });
          result && this.emit('node added', {
            moduleId,
            nodeId: data.nodeId
          });
        };

        const resolveNodeRemoved = (moduleId, data) => {
          const result = sqlite.removeZwaveDevice({ ...data, moduleId });
          result && this.emit('node removed', {
            moduleId,
            nodeId: data.nodeId
          });
        };

        const resolveNodeReady = (moduleId, data) => {
          const resilt = sqlite.addZwaveDeviceInformation({ ...data, name: data.paramName, moduleId });
          result && this.emit('node ready', {
            moduleId,
            nodeId: data.nodeId
          });
        };

        const resolveValueAdded = (moduleId, data) => {
          sqlite.addZwaveDevParam({ ...data, moduleId });
        };

        const resolveValueChanged = (moduleId, data) => {
          if (data.polled) {
              this.getPollIntensity(moduleId, data.valueId);
          } else {
            data.pollIntensity = 0;
          }

          const result = sqlite.processZwaveUpdate({ ...data, moduleId });
          const { paramId, value, polled } = result;

          if (!!paramId) {
            this.emit('parameter value changed', {
              paramId,
              value,
              polled
            });
          }
        };

        const resolveBasicReceived = (moduleId, data) => {
            console.log('BASIC SET RECEIVED');
            sqlite.processZwaveBasicSet({ ...data, moduleId });
        };

        const resolveResponse = (moduleId, data) => {
          const { request, requestParams, response } = data;

          const resolveGetPollIntResponse = (moduleId, valueId, response) => {
            sqlite.updateZwaveDevParam({
              moduleId,
              valueId,
              polled: !!response,
              pollIntensity: response
            });
          };

          switch (request) {
            case 'getPollIntensity':
              resolveGetPollIntResponse(moduleId, requestParams.valueId, response);
              break;
          }
        };

        const { moduleId, type, data } = message;

        const resolveType = R.cond([
          [R.equals('driver failed'),                () => resolveDriverFailed(moduleId)],
          [R.equals('node added'),                () => resolveNodeAdded(moduleId, data)],
          [R.equals('node removed'),            () => resolveNodeRemoved(moduleId, data)],
          [R.equals('node ready'),                 () => resolveNodeReady(moduleId, data)],
          [R.equals('value added'),               () => resolveValueAdded(moduleId, data)],
          [R.equals('value changed'),           () => resolveValueChanged(moduleId, data)],
          [R.equals('BASIC SET received'),  () => resolveBasicReceived(moduleId, data)],
          [R.equals('response'),                     () => resolveResponse(moduleId, data)],
        ]);

        resolveType(type);
    };

    setValue(paramId, value) {
        const result = sqlite.getZwaveParamByDevParam({ paramId });

        if (!!result) {
          const { moduleId, valueId } = result;
          mqtt.publish(`${moduleId}/Z-Wave`, 'setValue', { valueId, value });
        }
    };

    addNode(moduleId){
        mqtt.publish(`${moduleId}/Z-Wave`, 'addNode');
    };

    removeNode(moduleId){
        mqtt.publish( `${moduleId}/Z-Wave`, 'removeNode');
    };

    softReset(moduleId){
        mqtt.publish( `${moduleId}/Z-Wave`, 'softReset');
    };

    hardReset(moduleId){
        mqtt.publish( `${moduleId}/Z-Wave`, 'hardReset');
    };

    enablePoll(moduleId, valueId, intensity){
        mqtt.publish(`${moduleId}/Z-Wave`, 'enablePoll', { valueId, intensity });
    };

    disablePoll(moduleId, valueId){
        mqtt.publish( `${moduleId}/Z-Wave`, 'disablePoll', { valueId });
    };

    getPollIntensity(moduleId, valueId){
        mqtt.publish(`${moduleId}/Z-Wave`, 'getPollIntensity', { valueId });
    };

};

module.exports = new ZwaveInterface();
