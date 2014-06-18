module.exports = function(grunt) {

  // Note: nuget packaging of the Breeze.client nuget is done in breeze.server.net ( not here).
  
  var path = require('path');

  var srcDir = '../../src/';
  var destDir = '../';
  var baseFileNames = [ '_head.jsfrag', 'a??_*.js', '_tail.jsfrag'];
  var fileNames = [ '_head.jsfrag', 'a??_*.js', 'b??_*.js', '_tail.jsfrag'];
  
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    
    concat: {
      options: {
        separator: ';',
      },
      base: {
        src: mapPath(srcDir, baseFileNames),
        dest: destDir+'breeze.base.debug.js',
      },
      def: {
        src: mapPath(srcDir, fileNames),
        dest: destDir+'breeze.debug.js',
      }
    },
    
    uglify: {
      options: {
        report: 'min',
      },
      base: {
		    src: [destDir+'breeze.debug.js'],
        dest: destDir+'breeze.min.js'
      },
      def: {
        src: [destDir+'breeze.base.debug.js'],
		    dest: destDir+'breeze.base.min.js'
      },
    },
    
    yuidoc: {
      compile: {
        // 'src' here only for the newer task to pick up - not needed for yuidoc.
        src:       srcDir + '*.*',
        options: {
          paths:     srcDir,
          themedir:  '../../docs/api-docs-theme',
          outdir:    '../../docs/api-docs'
        }
      }
    },
    
    exec: {
      buildIntellisense: {
        // 'src' here only for the newer task to pick up - not needed for buildIntellisense
        src: srcDir + '*.*',
        cwd: 'intellisense',
        cmd: 'node server.js'
      }
    },
  });

  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-yuidoc');
  grunt.loadNpmTasks('grunt-newer');
  grunt.loadNpmTasks('grunt-exec');
  
  // No intellisense.
  grunt.registerTask('basic', ['newer:concat', 'newer:uglify', 'newer:yuidoc']);
  // Default task(s).
  grunt.registerTask('default', ['newer:concat', 'newer:uglify', 'newer:yuidoc', 'newer:exec']);
  
  function mapPath(dir, fileNames) {
    return fileNames.map(function(fileName) {
    	return dir + fileName;
    });
  };
  
  function log(err, stdout, stderr, cb) {
    if (err) {
      grunt.log.write(err);
      grunt.log.write(stderr);
      throw new Error("Failed");
    }

    grunt.log.write(stdout);
    cb();
  }

};