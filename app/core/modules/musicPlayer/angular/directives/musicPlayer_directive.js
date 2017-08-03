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

angular.module('yolk').directive('yolkThumb', function($rootScope) {
  return function(scope, element, attrs) {
		if(!scope.settings) return;
    var paths=scope.settings.paths;
		if(!scope.image) scope.image = {}
    var thisPath = path.join(paths[attrs.cat],attrs.id,'thumb.jpg');
    if(filetools.isThere('file',thisPath)){
			scope.image[attrs.id] = thisPath;
    }else{
			scope.image[attrs.id] = scope.lib.noart;
    }
  };
});
