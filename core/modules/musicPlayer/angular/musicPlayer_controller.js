'use strict';

angular.module('yolk').controller('musicPlayer', [
'$scope','$timeout','dims','utils','lazy','audio','jamendo','internetarchive','youtube','tracks','search','pin',
function($scope,$timeout,dims,utils,lazy,audio,jamendo,internetarchive,youtube,tracks,search,pin) {

	const mod_name = 'musicPlayer';
	//const {ipcRenderer} = require('electron');
	const {dialog} = require('electron').remote
	const defaults = require('../musicPlayer.js');

	$scope.db_index = defaults.db_index.index;
	$scope.progress={};
	$scope.Sortby={};

	$scope.db = new utils().db;
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

	//$scope.data_sources = ['local','jamendo','internetarchive','youtube','torrents'];
	$scope.data_sources = ['local','internetarchive','youtube'];
	$scope.db.fetch('global.settings.'+mod_name).then(function(data){
		$scope.pin.pin('source','local');
		$timeout(function(){
			$scope.settings =data[0];
			$scope.dbReady = true;
			$scope.settings_loaded = true;
			$scope.tracks.checkLocal('local');
			//todo - save state to db and restore on load

		});

	});
	/*
	$scope.db.fetch($scope.db_index+'.internetarchive','(metadata.title:"talking~ heads~" metadata.artist:"talking~ heads~" metadata.album:"talking~ heads~")').then(function(data){
		console.log(data)
	})
	*/
	//stop scanning the local filesystem if window dies
	window.onbeforeunload = function(){
		//console.log('close');
		//ipcRenderer.send('dBase', false);
	};
	$('#search input').on('submit',function(){
		console.log('submit')
	});

	$scope.dev=function(){
		if($scope.dims.dev){
			$scope.dims.dev = false;
		}else{
			$scope.dims.dev = true;
		}
	}

	$scope.$watch('settings',function(newVal,oldVal){
		if(newVal!==oldVal && $scope.settings_loaded){
			$scope.db.update('global.settings.'+mod_name,newVal);
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
	if(!ipcRenderer._events.track){
		ipcRenderer.on('track',function(event,data){
			$scope.tracks.add(data);
		});
	}
	if(!ipcRenderer._events.refresh){
		ipcRenderer.on('refresh',function(event,data){
			$scope.search.go();
		});
	}
	if(!ipcRenderer._events.progress){
		ipcRenderer.on('progress',function(event,data){
			$timeout(function(){
				$scope.progress[data.type]=data.size;
			});
		});
	}
	if(!ipcRenderer._events.verify){
		ipcRenderer.on('verify',function(event,data){
			$scope.tracks.verify(data);
		});
	}
	$scope.tools = function(){
		ipcRenderer.send('tools');
	}

}])
