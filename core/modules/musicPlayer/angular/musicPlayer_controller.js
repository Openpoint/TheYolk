'use strict';

angular.module('yolk').controller('musicPlayer', [
'$scope','$timeout','dims','utils','lazy','audio','jamendo','internetarchive','youtube','tracks','search','pin',
function($scope,$timeout,dims,utils,lazy,audio,jamendo,internetarchive,youtube,tracks,search,pin) {	

	const mod_name = 'musicPlayer';
	const {ipcRenderer} = require('electron');
	const {dialog} = require('electron').remote
	
	$scope.progress={};
	$scope.Sortby={};

			
	$scope.audio = new audio($scope);
	$scope.search = new search($scope);	
	$scope.pin = new pin($scope);
	$scope.lazy = new lazy($scope);
	$scope.tracks = new tracks($scope);
	$scope.jamendo = new jamendo($scope);
	$scope.internetarchive = new internetarchive($scope);
	$scope.youtube = new youtube($scope);		
	$scope.dims = new dims($scope);
	
	$scope.dims.update();	
	$scope.lib={};
	$scope.lib.tracks=[];
	$scope.allTracks;
	
	
	
	//stop scanning the local filesystem if window dies
	window.onbeforeunload = function(){
		ipcRenderer.send('dBase', false);
	};
	
	$scope.dev=function(){
		if($scope.dims.dev){
			$scope.dims.dev = false;
		}else{
			$scope.dims.dev = true;
		}
	}
	$scope.db_index = window.Yolk.modules[mod_name].config.db_index;
	$scope.utils = new utils(mod_name);
	//Boot the database, indexes and settings
	$scope.data_sources = ['local','jamendo','internetarchive','youtube','torrents'];
	var Mapping={
		type: "string",
		analyzer: "english",
		fields:{
			raw:{
				type:  "string",
				index: "not_analyzed"
			}
		}
	}
	var mapping = {
		properties:{
			metadata:{
				properties:{
					title:Mapping,
					artist:Mapping,
					album:Mapping
				}
			}
		}
	}
	var types=[
		{
			type:'local',
			mapping:mapping
		},{
			type:'jamendo',
			mapping:mapping
		},{
			type:'internetarchive',
			mapping:mapping
		},{
			type:'youtube',
			mapping:mapping
		},{
			type:'torrents',
			mapping:mapping
		},{
			type:'search',
			mapping:mapping
		},		
	]
		
	$scope.utils.boot($scope.db_index,types).then(function(db){

		//database is ready - copy it to scope
		$scope.db = db;
		ipcRenderer.send('dBase',true);
		$scope.sort('metadata.title','raw');
		
		/*
		db.client.indices.getFieldMapping({
			index:'music_player',
			type:'local',
			fields:'metadata.title'
		},function(resp,data){
			console.log(resp);
			console.log(data);
		})
		* */
				
		//load settings
		$scope.utils.settings('music').then(function(settings){

			//todo - save state to db and restore on load
			$scope.pin.pin('source','local');
								
			$timeout(function(){
				$scope.settings = settings;	
				$scope.dbReady = true;
				$scope.settings_loaded = true;
				$scope.tracks.checkLocal('local');						
			});			
		});	
	});
	

	$scope.$watch('settings',function(newVal,oldVal){
		if(newVal!==oldVal && $scope.settings_loaded){
			$scope.db.update($scope.db_index+'.settings.music',newVal);
		}		
	},true);
	
	//set the local music library location and scan files
	$scope.fileSelect= function(){
		dialog.showOpenDialog({properties: ['openDirectory']},function(Dir){
			$scope.settings.paths.musicDir = Dir[0];
			$scope.$apply();									
			ipcRenderer.send('getDir', Dir[0]);
		})		
	}
	
	ipcRenderer.on('track',function(event,data){
		$scope.tracks.add(data);
	});
	ipcRenderer.on('refresh',function(event,data){
		$scope.search.go(true);
	});
	ipcRenderer.on('progress',function(event,data){

		$timeout(function(){
			$scope.progress[data.type]=data.size;
		});
		
	});	
	ipcRenderer.on('verify',function(event,data){		
		$scope.tracks.verify(data);
	})	
}])

