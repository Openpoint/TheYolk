'use strict';

//var _templateBase = './app/html';


const path = require('path');

angular.module('yolk', [
	require('angular-drag-drop'),
	'ngRoute',
	'ngAnimate',
])
.config(['$routeProvider','$locationProvider','$animateProvider', function ($routeProvider,$locationProvider,$animateProvider) {

	$routeProvider.when('/', {
		templateUrl:path.join(Yolk.root,'core/modules/boot/boot.html')
		//templateUrl:path.join(config.root,'core/modules/musicPlayer/musicPlayer.html')
	});
	//config.modules.forEach(function(module){
	for(var key in Yolk.modules){
		var module = Yolk.modules[key]
		if(module.controller && module.html && !module.config.extends){
			console.log(module.name)
			$routeProvider.when('/'+module.name, {
				templateUrl:module.html
			});
		}
	};

	$routeProvider.otherwise({ redirectTo: '/' });
	$animateProvider.classNameFilter(/ani-/);
	$locationProvider.html5Mode({
		enabled: true,
		requireBase: false
	});
}]);
