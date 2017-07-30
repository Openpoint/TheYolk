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

angular.module('yolk').controller('boot', ['$scope','$location',function($scope,$location) {

	const mod_name = 'boot';
	Yolk.prepare($scope,mod_name);

	$scope.installed = {};
	$scope.installed.message = "";
	$scope.installed.progress = "";
	$scope.root = Yolk.root;

	Yolk.remote('dbReady').then(function(){

		var length = 0;
		for (var property in Yolk.modules) {
			if (Yolk.modules.hasOwnProperty(property)) {
				if(Yolk.modules[property].config.db_index){
					length ++;
					var db_index = Yolk.modules[property].config.db_index;
					//var types = Yolk.modules[property].config.db_index.types;
					//$scope.utils = new utils(Yolk.modules[property].name);
					$scope.utils.boot(db_index).then(function(db){
						length --;
						if(length === 0){
							getSettings();
						}
					})
				}
			}
		}

	})
	function getSettings(){

		$scope.installed.message = 'Loading settings';
		//$scope.utils = new utils('boot');
		$scope.utils.boot('global').then(function(){
			var length = 0;
			var types = [];
			for (var property in Yolk.modules) {
				if (Yolk.modules.hasOwnProperty(property) && audit(Yolk.modules[property])) {
					length ++
					types.push(Yolk.modules[property].config.module_name);
				}
			}
			types.forEach(function(type){
				//if(!Yolk.modules[type].config.settings.paths) Yolk.modules[type].config.settings.paths = {};
				//Yolk.modules[type].config.settings.paths.home = Yolk.home;
				//Yolk.modules[type].config.settings.paths.root = Yolk.root;

				$scope.utils.settings(type).then(function(data){
					length --;
					//Yolk.modules[type].config.settings = data;
					Yolk.remote('set')(type,data);
					if(length === 0){
						$scope.$apply(function(){
							$location.path('/home');
						})
					}
				});
			})
		});
	};

	function audit(module){
		var pass = true;
		var required = ['config.module_name'];
		required.forEach(function(prop){
			prop = prop.split('.');
			var path = module;
			prop.forEach(function(deep){
				if(path[deep]){
					path = path[deep]
				}else{
					path = {};
					pass = false;
				}
			});
		});
		return pass;
	};
	if(!ipcRenderer._events.install){
		ipcRenderer.on('install',function(event,data){
			$scope.$apply(function(){
				if(data.java){
					$scope.installed.java = true;
				}
				if(data.elastic){
					$scope.installed.elastic = data.elastic;
					$scope.installed.home = Yolk.home;
				}
				if(data.message){
					$scope.installed.message = data.message;
				}
				if(data.percent){
					$scope.installed.log = false;
					$scope.installed.progress = data.percent+'%';
				}
				if(data.log){
					$scope.installed.progress = false;
					$scope.installed.log = data.log;
				}else{
					$scope.installed.log = false;
				}
			});
		})
	}
}])
