'use strict'

angular.module('yolk').controller('musicPlayer', [
'$scope','$timeout','dims','utils','lazy',
function($scope,$timeout,dims,utils,lazy) {
	
	$scope.lib={};
	$scope.lib.tracks=[];
	
	const {ipcRenderer} = require('electron');
	const {dialog} = require('electron').remote
	//stop scanning the local filesystem if window dies
	window.onbeforeunload = function(){
		ipcRenderer.send('dBase', false);
	};
	
	utils = new utils('musicPlayer');
	utils.boot('music_player',['local','internetarchive','jamendo']).then(function(db){
		$scope.db = db;
		
		//load settings
		utils.settings('local').then(function(settings){

					
			$timeout(function(){
				$scope.settings = settings;	
				$scope.dbReady = true;
				$scope.settings_loaded = true;
			});
			
			//load local music files from database
			if(settings.paths.musicDir){
				$scope.db.fetch(utils.index_root+'.local').then(function(data){
					ipcRenderer.send('verify', {
						dir:settings.paths.musicDir, 
						tracks:data
					});
					$scope.lib.tracks=data;
					$scope.lazy.refresh();
					//$scope.$apply();
				});
			}			
		});		
		
		/*
		db.listIndexes().then(function(data){
			//console.log(data);
		});
		db.fetch('musicplayer.settings').then(function(data){
			//console.log(data);
		});
		* */

	});
	$scope.lazy = new lazy($scope); //scrolling gui functionality

	$scope.dims = new dims();
	$scope.dims.update();
	$(window).resize(function(){
		$scope.dims.update();
		$timeout(function(){
			$scope.lazy.refresh();
			$('#playwindow').scrollTop($scope.dims.scrollTop);
		});
		
	});
	
	$scope.$watch('settings',function(newVal,oldVal){
		if(newVal!==oldVal && $scope.settings_loaded){
			$scope.db.update(utils.index_root+'.settings.local',newVal);
		}		
	},true);
	
	$scope.$watch('lib.tracks',function(newVal,oldVal){
		if(newVal!==oldVal){
			console.log($scope.lib.tracks);
		}		
	});
	
	
	//set the local music library location and scan files
	$scope.fileSelect= function(){
		dialog.showOpenDialog({properties: ['openDirectory']},function(Dir){
			$scope.settings.paths.musicDir = Dir[0];
			$scope.$apply();									
			ipcRenderer.send('getDir', Dir[0]);
		})		
	}
	var refresh;
	var count=0;
	ipcRenderer.on('track',function(event,data){
		$scope.lib.loading=true;
		$scope.db.put(utils.index_root+'.'+data.data.type+'.'+data.data.id,data.data).then(function(meta){
			console.log(data);
			count++;
			$scope.lib.tracks.push(data.data);
			if(count < 150){
				$timeout.cancel(refresh);
			}else{
				count=0;
			}			
			refresh = $timeout(function(){
				$scope.lib.loading=false;			
				$scope.lazy.refresh($('#playwindow').scrollTop());
			},500);			
		});
	});
	ipcRenderer.on('verify',function(event,data){
		console.log(data);
	})	
}])

