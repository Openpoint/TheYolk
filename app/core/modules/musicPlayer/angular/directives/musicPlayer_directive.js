"use strict"

/*
Copyright 2017 Michael Jonker (http://openpoint.ie)
This file is part of The Yolk.
The Yolk is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
any later version.
The Yolk is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with The Yolk.  If not, see <http://www.gnu.org/licenses/>.
*/

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
