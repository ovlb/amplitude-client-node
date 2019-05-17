"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http = require("http");
const https = require("https");
const querystring = require("querystring");
const url_1 = require("url");
class AmplitudeApiError extends Error {
    constructor(message, response) {
        super(message);
        this.response = response;
    }
}
exports.AmplitudeApiError = AmplitudeApiError;
class AmplitudeClient {
    constructor(apiKey, options = {}) {
        options = options || {};
        this.apiKey = apiKey;
        this.enabled = options.enabled !== false;
        this.appVersion = options.appVersion || null;
        this.setTime = options.setTime === true;
        this.maxRetries = options.maxRetries || 2;
        this.timeoutMs = options.timeoutMs || 5000;
        this.endpoint = options.endpoint || 'https://api.amplitude.com';
    }
    async track(event) {
        if (this.setTime) {
            event.time = Date.now();
        }
        if (this.appVersion) {
            event.app_version = this.appVersion;
        }
        if (!event.insert_id) {
            event.insert_id = Date.now() + '_' + Math.random().toString().substring(2);
        }
        const formData = {
            api_key: this.apiKey,
            event: JSON.stringify(event),
        };
        if (!this.enabled) {
            return {
                body: Buffer.alloc(0),
                start: new Date(),
                end: new Date(),
                requestOptions: {},
                responseHeaders: {},
                statusCode: 0,
                succeeded: true,
                retryCount: 0,
                requestData: formData,
            };
        }
        const options = {
            method: 'POST',
            path: '/httpapi',
        };
        return this.sendRequest(options, formData);
    }
    async groupIdentify(groupType, groupValue, groupProps) {
        const formData = {
            api_key: this.apiKey,
            identification: JSON.stringify({
                group_type: groupType,
                group_value: groupValue,
                group_properties: groupProps
            })
        };
        const options = {
            method: 'POST',
            path: '/groupidentify',
        };
        return this.sendRequest(options, formData);
    }
    async sendRequest(options, formData, retryCount = 0) {
        const url = new url_1.URL(this.endpoint);
        options.protocol = url.protocol;
        options.hostname = url.hostname;
        options.port = url.port;
        options.timeout = this.timeoutMs;
        const postData = querystring.stringify(formData);
        options.headers = options.headers || {};
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        options.headers['Content-Length'] = Buffer.byteLength(postData);
        const result = await new Promise((resolve, reject) => {
            const start = new Date();
            try {
                const httpLib = options.protocol === 'https' ? https : http;
                const req = httpLib.request(options, (res) => {
                    res.on('error', reject);
                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => {
                        resolve({
                            start,
                            end: new Date(),
                            body: Buffer.concat(chunks),
                            requestOptions: options,
                            responseHeaders: res.headers,
                            statusCode: res.statusCode || 0,
                            succeeded: res.statusCode === 200,
                            retryCount,
                            requestData: formData,
                        });
                    });
                });
                req.on('error', reject);
                req.write(postData);
                req.end();
            }
            catch (e) {
                reject(e);
            }
        });
        const retryableStatusCodes = {
            500: true,
            502: true,
            503: true,
            504: true,
        };
        if (!retryableStatusCodes[result.statusCode] || retryCount >= this.maxRetries) {
            if (result.succeeded) {
                return result;
            }
            const urlData = result.requestOptions;
            const url = `${urlData.protocol}//${urlData.hostname}` +
                `${urlData.port ? ':' + urlData.port : ''}${urlData.path}`;
            throw new AmplitudeApiError(`Amplitude API call failed with status ${result.statusCode} (${url})`, result);
        }
        return this.sendRequest(options, formData, retryCount + 1);
    }
}
exports.AmplitudeClient = AmplitudeClient;