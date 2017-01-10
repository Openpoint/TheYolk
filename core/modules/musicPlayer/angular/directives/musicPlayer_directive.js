"use strict"
const path = require('path');
const filetools = require(path.join(Yolk.root,'core/lib/filetools.js'));


angular.module('yolk').directive('yolkThumb', function() {

    return function(scope, element, attrs) {
        var parent = scope.$parent;
        if(parent.$parent){
            parent = parent.$parent;
        }
        var paths=parent.settings.paths
        var thisPath = path.join(paths[attrs.type+'s'],scope[attrs.type].id,'thumb.jpg');
        if(filetools.isThere('file',thisPath)){
            scope[attrs.type].image = thisPath
        }else{
            scope[attrs.type].image = parent.lib.noart
        }
    };
});
