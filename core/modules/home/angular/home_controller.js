'use strict';

angular.module('yolk').controller('home', [
'$scope',
function($scope) {
	const mod_name = 'boot';
	$scope.root = Yolk.root;
}])
