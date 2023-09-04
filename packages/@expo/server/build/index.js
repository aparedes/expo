"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpoRequest = exports.ExpoResponse = exports.createRequestHandler = exports.getRoutesManifest = void 0;
require("@expo/server/install");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const environment_1 = require("./environment");
Object.defineProperty(exports, "ExpoRequest", { enumerable: true, get: function () { return environment_1.ExpoRequest; } });
Object.defineProperty(exports, "ExpoResponse", { enumerable: true, get: function () { return environment_1.ExpoResponse; } });
const debug = require('debug')('expo:server');
function getProcessedManifest(path) {
    // TODO: JSON Schema for validation
    const routesManifest = JSON.parse(fs_1.default.readFileSync(path, 'utf-8'));
    const parsed = {
        ...routesManifest,
        notFoundRoutes: routesManifest.notFoundRoutes.map((value) => {
            return {
                ...value,
                namedRegex: new RegExp(value.namedRegex),
            };
        }),
        dynamicRoutes: routesManifest.dynamicRoutes.map((value) => {
            return {
                ...value,
                namedRegex: new RegExp(value.namedRegex),
            };
        }),
        staticRoutes: routesManifest.staticRoutes.map((value) => {
            return {
                ...value,
                namedRegex: new RegExp(value.namedRegex),
            };
        }),
    };
    return parsed;
}
function getRoutesManifest(distFolder) {
    return getProcessedManifest(path_1.default.join(distFolder, '_expo/routes.json'));
}
exports.getRoutesManifest = getRoutesManifest;
// TODO: Reuse this for dev as well
function createRequestHandler(distFolder, { getRoutesManifest: getInternalRotuesManifest, getHtml = async (request, route) => {
    // serve a static file
    const filePath = path_1.default.join(distFolder, route.page + '.html');
    if (!fs_1.default.existsSync(filePath)) {
        return null;
    }
    return fs_1.default.readFileSync(filePath, 'utf-8');
}, getApiRoute = async (route) => {
    const filePath = path_1.default.join(distFolder, '_expo/functions', route.page + '.js');
    debug(`Handling API route: ${route.page}: ${filePath}`);
    // TODO: What's the standard behavior for malformed projects?
    if (!fs_1.default.existsSync(filePath)) {
        return null;
    }
    return require(filePath);
}, logApiRouteExecutionError = (error) => {
    console.error(error);
}, } = {}) {
    let routesManifest;
    function updateRequestWithConfig(request, config) {
        const url = request.url;
        request[environment_1.NON_STANDARD_SYMBOL] = {
            url: config ? environment_1.ExpoURL.from(url, config) : new environment_1.ExpoURL(url),
        };
    }
    return async function handler(request) {
        if (getInternalRotuesManifest) {
            const manifest = await getInternalRotuesManifest(distFolder);
            if (manifest) {
                routesManifest = manifest;
            }
            else {
                // Development error when Expo Router is not setup.
                return new environment_1.ExpoResponse('No routes manifest found', {
                    status: 404,
                    headers: {
                        'Content-Type': 'text/plain',
                    },
                });
            }
        }
        else if (!routesManifest) {
            routesManifest = getRoutesManifest(distFolder);
        }
        const url = new url_1.URL(request.url, 'http://expo.dev');
        const sanitizedPathname = url.pathname;
        debug('Request', sanitizedPathname);
        if (request.method === 'GET' || request.method === 'HEAD') {
            // First test static routes
            for (const route of routesManifest.staticRoutes) {
                if (!route.namedRegex.test(sanitizedPathname)) {
                    continue;
                }
                // // Mutate to add the expoUrl object.
                updateRequestWithConfig(request, route);
                // serve a static file
                const contents = await getHtml(request, route);
                // TODO: What's the standard behavior for malformed projects?
                if (!contents) {
                    return new environment_1.ExpoResponse('Not found', {
                        status: 404,
                        headers: {
                            'Content-Type': 'text/plain',
                        },
                    });
                }
                else if (contents instanceof environment_1.ExpoResponse) {
                    return contents;
                }
                return new environment_1.ExpoResponse(contents, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/html',
                    },
                });
            }
        }
        // Next, test API routes
        for (const route of routesManifest.dynamicRoutes) {
            if (!route.namedRegex.test(sanitizedPathname)) {
                continue;
            }
            const func = await getApiRoute(route);
            if (func instanceof environment_1.ExpoResponse) {
                return func;
            }
            const routeHandler = func[request.method];
            if (!routeHandler) {
                return new environment_1.ExpoResponse('Method not allowed', {
                    status: 405,
                    headers: {
                        'Content-Type': 'text/plain',
                    },
                });
            }
            // Mutate to add the expoUrl object.
            updateRequestWithConfig(request, route);
            try {
                // TODO: Handle undefined
                return (await routeHandler(request));
            }
            catch (error) {
                if (error instanceof Error) {
                    logApiRouteExecutionError(error);
                }
                return new environment_1.ExpoResponse('Internal server error', {
                    status: 500,
                    headers: {
                        'Content-Type': 'text/plain',
                    },
                });
            }
        }
        // Finally, test 404 routes
        for (const route of routesManifest.notFoundRoutes) {
            if (!route.namedRegex.test(sanitizedPathname)) {
                continue;
            }
            // // Mutate to add the expoUrl object.
            updateRequestWithConfig(request, route);
            // serve a static file
            const contents = await getHtml(request, route);
            // TODO: What's the standard behavior for malformed projects?
            if (!contents) {
                return new environment_1.ExpoResponse('Not found', {
                    status: 404,
                    headers: {
                        'Content-Type': 'text/plain',
                    },
                });
            }
            else if (contents instanceof environment_1.ExpoResponse) {
                return contents;
            }
            return new environment_1.ExpoResponse(contents, {
                status: 404,
                headers: {
                    'Content-Type': 'text/html',
                },
            });
        }
        // 404
        const response = new environment_1.ExpoResponse('Not found', {
            status: 404,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
        return response;
    };
}
exports.createRequestHandler = createRequestHandler;
