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

angular.module('yolk').controller('home', ['$scope','link',function($scope,link) {

	const path = require('path');
	const mod_name = 'home';
	Yolk.prepare($scope,mod_name);
	$scope.noicon = path.join(Yolk.root,'core/lib/css/noicon.png')
	$scope.widgets = {
		core:[]
	}
	$scope.version = Yolk.remote('version');
	$.get('https://api.github.com/repos/Openpoint/Yolk/releases/latest',function(data){
		if(data.name!==$scope.version){
			$scope.$apply(function(){
				$scope.newversion = data.name;
			})
		}
	})
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
