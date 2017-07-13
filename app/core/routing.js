'use strict';

//var _templateBase = './app/html';


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
