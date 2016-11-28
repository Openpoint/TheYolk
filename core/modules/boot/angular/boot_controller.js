'use strict';

angular.module('yolk').controller('boot', [
'$scope','$timeout','utils',
function($scope,$timeout,utils) {	
	const mod_name = 'boot';
	var booting = false;
	
	$scope.installed = {};
	
	function bootDbase(){
		if(booting){
			return;
		}
		booting = true;
		//console.log('booting');
		$timeout(function(){
			$scope.installed.message = 'Starting the database';
			$scope.installed.progress = false;			
		});

		var length = 0;
		for (var property in Yolk.config.modules) {
			if (Yolk.config.modules.hasOwnProperty(property)) {
				if(Yolk.config.modules[property].config.db_index){
					length ++;
					
					var db_index = Yolk.config.modules[property].config.db_index.index;
					var types = Yolk.config.modules[property].config.db_index.types;
					$scope.utils = new utils(Yolk.config.modules[property].name);
					$scope.utils.boot(db_index,types).then(function(db){
						length --;
						if(length === 0){
							ipcRenderer.send('dBase',true);
							getSettings();
						}						
					},function(err){
						console.log(err);
					})
				}
			}
		}	
	}
	function getSettings(){
		//console.log('settings');
		$timeout(function(){
			$scope.installed.message = 'Loading settings';
		})
		
		$scope.utils = new utils('boot');

		$scope.utils.boot('global').then(function(db){

			var length = 0;
			for (var property in Yolk.config.modules) {
				
				if (Yolk.config.modules.hasOwnProperty(property) && audit(Yolk.config.modules[property])) {
					length ++					
					var type = Yolk.config.modules[property].config.module_name;
					$scope.utils.settings(type).then(function(data){
						length --;
						
						if(data){
							Yolk.config.modules[type].config.settings = data;
							
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

				case 'done':
					event.sender.send('install','ready');
					bootDbase();
				break
			}
		})
	}
	
}])

