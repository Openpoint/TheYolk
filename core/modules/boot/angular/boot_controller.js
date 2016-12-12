'use strict';

angular.module('yolk').controller('boot', [
'$scope','$timeout','utils',
function($scope,$timeout,utils) {

	const mod_name = 'boot';

	$scope.installed = {};
	$scope.installed.message = 'Starting the database';
	$scope.installed.progress = false;

	Yolk.remote('dbReady').then(function(){
		
		var length = 0;
		for (var property in Yolk.modules) {
			if (Yolk.modules.hasOwnProperty(property)) {
				if(Yolk.modules[property].config.db_index){
					length ++;

					var db_index = Yolk.modules[property].config.db_index.index;
					var types = Yolk.modules[property].config.db_index.types;
					$scope.utils = new utils(Yolk.modules[property].name);
					$scope.utils.boot(db_index,types).then(function(db){
						length --;
						if(length === 0){
							getSettings();
						}
					},function(err){
						console.log(err);
					})
				}
			}
		}
	})

	function getSettings(){
		//console.log('settings');
		$timeout(function(){
			$scope.installed.message = 'Loading settings';
		})

		$scope.utils = new utils('boot');

		$scope.utils.boot('global').then(function(db){

			var length = 0;
			for (var property in Yolk.modules) {

				if (Yolk.modules.hasOwnProperty(property) && audit(Yolk.modules[property])) {
					length ++
					var type = Yolk.modules[property].config.module_name;
					$scope.utils.settings(type).then(function(data){
						length --;

						if(data){
							Yolk.modules[type].config.settings = data;

						}
						if(length === 0){
							window.location.assign('#home');
						}
					},function(err){
						console.log(err);
					});

				}
			}
		},function(err){
			console.log(err);
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
			switch(data.type){
				case 'progress':
					$timeout(function(){
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

				break;
				case 'log':
					console.log(data.message);
				break;
			}
		})
	}

}])
