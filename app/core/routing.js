'use strict';

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

angular.module('yolk', [
	require('angular-drag-drop'),
	'ngRoute',
	'ngAnimate',
])
.config(['$routeProvider','$locationProvider','$animateProvider', function ($routeProvider,$locationProvider,$animateProvider) {
	for(var key in Yolk.modules){
		var module = Yolk.modules[key]
		if(module.controller && module.html && !module.config.extends){
			$routeProvider.when('/'+module.name, {
				templateUrl:module.html
			});
		}
	};
	$animateProvider.classNameFilter(/ani-/);
	/*
	$locationProvider.html5Mode({
		enabled:false,
		requireBase:false
	});
	*/
}]);
