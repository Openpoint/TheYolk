'use strict';

angular.module('yolk').controller('home', [
'$scope','$timeout',
function($scope,$timeout) {
	console.log(window.location.href+' : '+window.location.pathname)
	const mod_name = 'boot';
}])
