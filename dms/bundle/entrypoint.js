require('source-map-support').install()

global.Promise = require('bluebird')

Promise.config({
  longStackTraces: process.env.NODE_ENV !== 'production'
})

require('./src/index.js')
