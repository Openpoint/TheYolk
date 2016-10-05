'use strict';	

//var _templateBase = './app/html';


const path = require('path');

angular.module('yolk', [
	'ngRoute',
	'ngAnimate'
])
.config(['$routeProvider','$animateProvider', function ($routeProvider,$animateProvider) {
	
	$routeProvider.when('/', {
		templateUrl:path.join(config.root,'core/yolk.html')
	});
	//config.modules.forEach(function(module){
	for(var key in config.modules){
		var module = config.modules[key]
		if(module.controller && module.html && !module.config.extends){
			
			$routeProvider.when('/'+module.name, {
				templateUrl:module.html
			});			
		}
	};

	$routeProvider.otherwise({ redirectTo: '/' });
	$animateProvider.classNameFilter(/ani-/);
}]);



