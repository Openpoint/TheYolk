'use strict';

angular.module('yolk').controller('musicPlayer', [
'$scope','$timeout','dims','utils','lazy','audio','jamendo','internetarchive','youtube','tracks','search','pin',
function($scope,$timeout,dims,utils,lazy,audio,jamendo,internetarchive,youtube,tracks,search,pin) {

	const mod_name = 'musicPlayer';
	//const {ipcRenderer} = require('electron');
	const {dialog} = require('electron').remote
	const defaults = require('../musicPlayer.js');
	const path = require('path');

	$scope.db_index = defaults.db_index.index;
	$scope.progress={};
	$scope.Sortby={};
	$scope.utils = new utils();
	$scope.db = $scope.utils.db;
	$scope.audio = new audio($scope);
	$scope.search = new search($scope);
	$scope.pin = new pin($scope);
	$scope.lazy = new lazy($scope);
	$scope.tracks = new tracks($scope);
	$scope.jamendo = new jamendo($scope);
	$scope.internetarchive = new internetarchive($scope);
	$scope.youtube = new youtube($scope);
	$scope.dims = new dims($scope);


	$scope.spacer = true;
	$scope.sortby={
		dir:'asc',
		field:'raw',
		term:'metadata.title'
	}
	//$scope.sort('metadata.title','raw');
	$scope.Sort = 'title';
	$scope.dims.update();
	$scope.lib={};
	$scope.lib.tracks=[];
	$scope.allTracks;

	//$scope.data_sources = ['local','jamendo','internetarchive','youtube','torrents'];
	$scope.data_sources = ['local','internetarchive','youtube'];
	$scope.db.get('global.settings.'+mod_name).then(function(data){
		$scope.pinned.sources = ['local','online'];
		$scope.sources=$scope.data_sources;
		$scope.search.go();
		$timeout(function(){
			$scope.settings =data;
			$scope.settings.paths.home = Yolk.home;
			$scope.settings.paths.root = Yolk.root;
			$scope.settings.paths.artists = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.artist_images);
			$scope.settings.paths.albums = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.album_images);
			//$scope.dbReady = true;
			//$scope.settings_loaded = true;
			//$scope.tracks.checkLocal('local');
			//todo - save state to db and restore on load

		});

	});

	//stop scanning the local filesystem if window dies
	window.onbeforeunload = function(){
		//console.log('close');
		//ipcRenderer.send('dBase', false);
	};
	/*
	$('#search input').on('submit',function(){
		console.log('submit')
	});
	*/
	$scope.imagePath=function(type,id){
		if(type && id){
			var Path = path.join($scope.settings.paths[type],id,'thumb.jpg');
			return Path;
		}else{
			return false;
		}

	}
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
	/*
	if(!ipcRenderer._events.track){
		ipcRenderer.on('track',function(event,data){
			$scope.tracks.add(data);
		});
	}
	*/
	if(!ipcRenderer._events.refresh){
		ipcRenderer.on('refresh',function(event,data){
			$scope.search.go(false,true);
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
	/*
	$scope.tools = function(){
		ipcRenderer.send('tools');
	}
	*/
	$('#search').click(function(){
		$('#search input').focus();
	})
}])
