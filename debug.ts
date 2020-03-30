import pkg from './package.json';

export const rootDebug = require('debug-fabulous').spawnable(pkg.name);
