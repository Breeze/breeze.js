# How to release a new version of breeze.js client

## breeze.js

1. Update and test, test, test
1. Update `Breeze/breeze.js/src/_head.jsfrag` to new version number
1. In Breeze/breeze.js/build, run `gulp`
1. Commit and push files
1. Create and push tag with new version number

## bower-breeze-client

1. Update `bower-breeze-client/bower.json` to new version number
1. Update `bower-breeze-client/build/package.json` to new version number
1. In bower-breeze-client/build, run `gulp`
1. Commit and push files
1. Create and push tag with new version number

## breeze.server.node

1. Update `breeze.server.node/breeze-client/package.json` to new version number
1. In breeze.server.node/breeze-client/build, run `gulp`
1. In breeze.server.node/breeze-client, run `npm publish`

## breeze.server.net

1. In breeze.server.net/build, run `gulp`
1. To deploy just the Breeze.Client package, run `gulp nugetDeployClient`
1. To deploy ALL nuget packages, run `gulp nugetDeploy`

## breeze.github.io

1. Update `breeze.github.io/doc-js/release-notes.md` with version information
1. Make a zip file, `breeze-client-x.x.x.zip` in breeze.js/build and copy it to breeze.github.io/downloads
1. Update `breeze.github.io/doc-js/download.html` with new zip file link (line 9)
1. Update `breeze.github.io/doc-js/download.html` with commit SHA (line 31 and 32) from https://github.com/Breeze/breeze.js

