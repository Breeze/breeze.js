gulp minify
cp breeze.debug.js ../../webcmgui/src/bower_components/breeze-client/build/breeze.debug.js
rsync breeze.debug.js root@10.2.60.22:/cm/local/apps/cmd/etc/htdocs/webcmgui/pretty/bower_components/breeze-client/build/breeze.debug.js
