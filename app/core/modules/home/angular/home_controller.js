'use strict';
angular.module('yolk').controller('home', ['$scope','link',function($scope,link) {

	const path = require('path');
	const mod_name = 'home';
	Yolk.prepare($scope,mod_name);
	$scope.noicon = path.join(Yolk.root,'core/lib/css/noicon.png')
	$scope.widgets = {
		core:[]
	}
	$scope.version = Yolk.remote('version');
	Object.keys(Yolk.modules).forEach(function(key){
		if(Yolk.modules.hasOwnProperty(key) && Yolk.modules[key].config.home){
			var widget = {
				label:Yolk.modules[key].config.home.label,
				icon:Yolk.modules[key].config.home.icon,
				path:'#!/'+Yolk.modules[key].config.module_name
			}
			$scope.widgets.core.push(widget)
		}
	})
	$scope.link = new link($scope);

	$scope.$watch('url',function(newval,oldval){
		if(newval!==oldval) $scope.error = false;
	})
	$scope.get = function(url,e){
		if(e && e.key!=='Enter'){
			$scope.error = false;
			return;
		}
		if(url.indexOf("http")!== 0) url = 'http://'+url;
		$scope.link.get(url).then(function(ok){
			if(ok){
				$scope.$apply(function(){
					$scope.url = '';
				})

			}else{
				$scope.$apply(function(){
					$scope.error = true;
				})
			}
		})
	}
}])
