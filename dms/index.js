global.Promise = require('bluebird')

Promise.config({
  longStackTraces: process.env.NODE_ENV !== 'production'
})

require('babel-register')
require('./src/index.js')
