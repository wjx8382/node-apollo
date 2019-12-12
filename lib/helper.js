'use strict';

const assert = require('assert');

module.exports = {
  // https://stackoverflow.com/questions/3710204/how-to-check-if-a-string-is-a-valid-json-string-in-javascript-without-using-try
  // 先判断是否是JSON String 格式，不是则直接返回原始string
  toJSON(str) {
    if (/^[\],:{}\s]*$/.test(str.replace(/\\["\\\/bfnrtu]/g, '@').
      replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
      replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {
      return JSON.parse(str);
    } else {
      return str;
    }
  },

  mergeConfig(payload) {
    assert(Array.isArray(payload), 'Apollo config should be an array');
    const publicPayload = [];
    const privatePayload = [];
    for (let meta of payload) {
      if (meta.isPublic) {
        publicPayload.push(...this._itemsPick(meta.items, ['key', 'value']));
      } else {
        privatePayload.push(...this._itemsPick(meta.items, ['key', 'value']));
      }
    }
    // Apollo配置加载顺序如下，后加载的会覆盖前面的同名配置
    // -> 公开配置
    // -> 私有配置
    return Object.assign({}, ...privatePayload, ...publicPayload);
  },

  // 合并配置
  mergeConfigurations(payload) {
    assert(Array.isArray(payload), 'Apollo config should be an array');
    try {
      // 从缓存和非缓存获取的response报文不一致
      const confs = payload.map(pl => pl.data.content ? JSON.parse(pl.data.content) : (pl.data.configurations || pl.data));
      return assignDeep({}, ...confs);
    } catch(err) {
      assert(err, 'Apollo configs not be merged');
    }
  },

  _itemsPick(items, keys) {
    const ret = [];
    for (let item of items) {
      let obj = {};
      obj[item.key] = this.toJSON(item.value);
      ret.push(obj);
    }
    return ret;
  },

  // clientIp这个参数是可选的，用来实现灰度发布。 如果不想传这个参数，请注意URL中从?号开始的query parameters整个都不要出现。
  getConfigFromApolloUri(config) {
    // 读取环境变量
    const { configServerUrl, appId, clusterName, namespaceName, clientIp } = config;
    assert(configServerUrl, 'configServerUrl is required');
    assert(appId, 'appId is required');
    assert(clusterName, 'clusterName is required');
    assert(namespaceName, 'namespaceName is required');
    let apolloString;
    if (clientIp) {
      apolloString = `${configServerUrl}/configfiles/json/${appId}/${clusterName}/${namespaceName}?ip=${clientIp}`;
    } else {
      apolloString = `${configServerUrl}/configfiles/json/${appId}/${clusterName}/${namespaceName}`;
    }

    return apolloString;
  },

  // 获取集群下所有Namespace信息接口
  getAllConfigFromApolloUri(config) {
    const { configServerUrl, appId, clusterName, apolloEnv } = config;
    assert(configServerUrl, 'configServerUrl is required');
    assert(appId, 'appId is required');
    assert(clusterName, 'clusterName is required');
    let apolloString = `${configServerUrl}/openapi/v1/envs/${apolloEnv}/apps/${appId}/clusters/${clusterName}/namespaces`;

    return apolloString;
  },

  // 通过带缓存的Http接口从Apollo读取配置
  getConfigFromCacheUri(config) {
    const { configServerUrl, appId, clusterName, namespaceName, clientIp } = config;
    assert(configServerUrl, 'configServerUrl is required');
    assert(namespaceName, 'namespaceName is required');
    assert(appId, 'appId is required');
    assert(clusterName, 'clusterName is required');
    if (Array.isArray(namespaceName)) {
      if (namespaceName.length === 0) return [`${configServerUrl}/configfiles/json/${appId}/${clusterName}/application?ip=${clientIp}`];
      return namespaceName.map(n => `${configServerUrl}/configfiles/json/${appId}/${clusterName}/${n}?ip=${clientIp}`);
    } else {
      return [`${configServerUrl}/configfiles/json/${appId}/${clusterName}/${namespaceName}?ip=${clientIp}`];
    }
  },

  // 通过不带缓存的Http接口从Apollo读取配置
  getConfigSkipCacheUri(config) {
    const { configServerUrl, appId, clusterName, namespaceName, releaseKey, clientIp } = config;
    assert(configServerUrl, 'configServerUrl is required');
    assert(namespaceName, 'namespaceName is required');
    assert(appId, 'appId is required');
    assert(clusterName, 'clusterName is required');
    if (Array.isArray(namespaceName)) {
      if (namespaceName.length === 0) return [`${configServerUrl}/configs/${appId}/${clusterName}/application?releaseKey=${releaseKey}&ip=${clientIp}`];
      return namespaceName.map(n => `${configServerUrl}/configs/${appId}/${clusterName}/${n}?releaseKey=${releaseKey}&ip=${clientIp}`);
    } else {
      return [`${configServerUrl}/configs/${appId}/${clusterName}/${namespaceName}?releaseKey=${releaseKey}&ip=${clientIp}`];
    }
  }
};

function assignDeep(target, ...sources) {
  // 1. 参数校验
  if (target == null) {
      throw new TypeError('Cannot convert undefined or null to object');
  }

  // 2. 如果是基本类型，则转换包装对象
  let result = Object(target);
  // 3. 缓存已拷贝过的对象
  let hash = new WeakMap();
  
  // 4. 目标属性是否可直接覆盖赋值判断
  function canPropertyCover(node) {
      if (!node.target[node.key]) {
          return true;
      }
      if (node.target[node.key] == null) {
          return true;
      }
      if (!(typeof node.target[node.key] === 'object')) {
          return true;
      }
      if (Array.isArray(node.target[node.key]) !== Array.isArray(node.data)) {
          return true;
      }
      return false;
  }
  
  sources.forEach(v => {
      let source = Object(v);
      
      let stack = [{
          data: source,
          key: undefined,
          target: result
      }];

      while(stack.length > 0) {
          let node = stack.pop();
          if (typeof node.data === 'object' && node.data !== null) {
              let isPropertyDone = false;
              if (hash.get(node.data) && node.key !== undefined) {
                  if (canPropertyCover(node)) {
                      node.target[node.key] = hash.get(node.data);
                      isPropertyDone = true;
                  }
              }
              
              if(!isPropertyDone) {
                  let target;
                  if (node.key !== undefined) {
                      if (canPropertyCover(node)) {
                          target = Array.isArray(node.data) ? [] : {};
                          hash.set(node.data, target);
                          node.target[node.key] = target;
                      } else {
                          target = node.target[node.key];
                      }
                  } else {
                      target = node.target;
                  }
                  
                  Reflect.ownKeys(node.data).forEach(key => {
                      // 过滤不可枚举属性
                      if (!Object.getOwnPropertyDescriptor(node.data, key).enumerable) {
                          return;
                      }
                      stack.push({
                          data: node.data[key],
                          key: key,
                          target: target
                      });
                  });
              }
          } else {
              Object.assign(node.target, {[node.key]: node.data});
          }
      }

  });

  return result;
}
