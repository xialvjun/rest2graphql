module.exports = require('farrow').createFarrowConfig({
  server: {
    // autoExternal: false,
    esbuild: {
      target: 'es6'
    }
  }
})
