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

angular.module('yolk').directive('linkWidget', function() {
    return function(scope, element, attrs) {
		scope.widget.title = scope.widget.title.trim();
        var newtit = scope.widget.title.substring(0,45);
		if(newtit.length !== scope.widget.title.length) scope.widget.title = newtit+'...'
    };
}).directive('onErrorSrc', function() {
    return {
        link: function(scope, element, attrs) {
          element.bind('error', function() {
            attrs.$set('src', 'core/lib/css/noimage.png');
          });
        }
    }
});
