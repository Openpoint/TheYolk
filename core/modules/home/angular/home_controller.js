'use strict';

angular.module('yolk').controller('home', [
'$scope','$timeout',
function($scope,$timeout) {
	const mod_name = 'boot';
	$scope.root = Yolk.root;
}])
