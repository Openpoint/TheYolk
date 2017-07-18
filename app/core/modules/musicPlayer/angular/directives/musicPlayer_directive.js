"use strict"
const path = require('path');
const fs = require('fs');
const filetools = require(path.join(Yolk.root,'core/lib/filetools.js'));

angular.module('yolk').directive('yolkThumb', function() {
    return function(scope, element, attrs) {
        var parent = scope.$parent;
        if(parent.$parent){
            parent = parent.$parent;
        }
        var paths=parent.settings.paths;
        var thisPath = path.join(paths[attrs.cat],scope[attrs.cat].id,'thumb.jpg');
        if(filetools.isThere('file',thisPath)){
            scope[attrs.cat].image = thisPath
        }else{
            scope[attrs.cat].image = parent.lib.noart
        }
    };
});

angular.module('yolk').directive('yolkAlbum', function() {
    return function(scope, element, attrs){
        var parent = scope.$parent.$parent.$parent.$parent;
        var Path = parent.settings.paths.album;
        var thisPath = path.join(Path,scope.album.id,'thumb.jpg');
        scope.album.image = thisPath;
    }
})
