'use strict';

angular.module('yolk').controller('musicPlayer', [
'$scope','$timeout','dims','utils','lazy','audio','jamendo','internetarchive','youtube','tracks','search','pin',
function($scope,$timeout,dims,utils,lazy,audio,jamendo,internetarchive,youtube,tracks,search,pin) {

	const mod_name = 'musicPlayer';
	//const {ipcRenderer} = require('electron');
	const {dialog} = require('electron').remote
	const defaults = require('../musicPlayer.js');
	const path = require('path');
	const Q = require('promise');

	ipcRenderer.send('kill','revive');
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
	$scope.countries = require(path.join(Yolk.root,'core/modules/musicPlayer/lib/tools/countries.json'));
	$scope.tools = require('../lib/tools/searchtools.js');
	$scope.Sort = {};

	$scope.dims.update();
	$scope.lib={
		bios:{},
		tracks:[],
		drawers:{}
	};
	$scope.allTracks;

	//$scope.data_sources = ['local','jamendo','internetarchive','youtube','torrents'];
	//$scope.data_sources = ['local','internetarchive','youtube'];
	$scope.db.get('global.settings.'+mod_name).then(function(data){
		$scope.settings = data;
		$scope.settings.paths.home = Yolk.home;
		$scope.settings.paths.root = Yolk.root;
		$scope.settings.paths.artist = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.artist_images);
		$scope.settings.paths.album = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.album_images);
		$scope.lib.noart = path.join(Yolk.root,'core/modules/musicPlayer/images/noImage.svg');
		$scope.search.go();
		$timeout(function(){
			$scope.settings_loaded = true;
		})
	});

	//stop scanning the local filesystem if window dies
	window.onbeforeunload = function(){
		//console.log('close');
		//ipcRenderer.send('dBase', false);
	};

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



	//set the local music library location and scan files
	$scope.fileSelect= function(){
		dialog.showOpenDialog({properties: ['openDirectory']},function(Dir){
			$scope.settings.paths.musicDir = Dir[0];
			$scope.$apply();
			ipcRenderer.send('getDir', Dir[0]);
		})
	}


	var refresh_time = false;
	if(!ipcRenderer._events.refresh){
		ipcRenderer.on('refresh',function(event,data){
			clearTimeout(refresh_time);
			refresh_time = setTimeout(function(){
				$scope.tracks.refreshDrawers();
				$scope.search.go(true);
			},999)
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
			console.log('verify');
			console.log(data);
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
	$scope.$watch('settings',function(newVal,oldVal){
		if(newVal!==oldVal && $scope.settings_loaded){
			$scope.db.update({
				index:'global',
				type:'settings',
				id:mod_name,
				body:{doc:newVal}
			}).then(function(data){
				//console.log(data)
			},function(err){
				console.error(err)
			})
		}
	},true);


	var searchTime;
	$scope.$watch('searchTerm',function(oldVal,newVal){
		if($scope.searchTerm && $scope.searchTerm.length){
			$('#search .hide').html($scope.searchTerm);
			$('#search input').width($('#search .hide').width()+10+'px');
		}else{
			$('#search input').width('100px')
		}

		if(oldVal!==newVal){
			if($scope.searchTerm && $scope.searchTerm.length > 1){
				$scope.goSearch = true;
				var terms = $scope.tools.terms($scope.searchTerm);
				$scope.pin.pinned.prefix = terms.prefix;
				$scope.pin.pinned.album = terms.album;
				$scope.pin.pinned.artist = terms.artist;
				$scope.pin.pinned.title = terms.title;
			}else{
				$scope.pin.pinned.prefix = false;
				$scope.pin.pinned.album = false;
				$scope.pin.pinned.artist = false;
				$scope.pin.pinned.title = false;
				$scope.goSearch = false;
			}
			$timeout.cancel(searchTime);
			searchTime = $timeout(function(){
				$scope.search.go();
			},500);
		}
	});

	//for development purposes - destroy the database and reload
	$scope.nuke=function(){
		ipcRenderer.send('kill');
		$scope.db.client.search({
			index:'global',
			type:'settings',
			size:1000
		}).then(function(data){
			var bulk = []
			data.hits.hits.forEach(function(hit){

				if(hit._id === 'musicPlayer'){
					hit._source.paths.musicDir = false;
				}
				bulk.push({index:{_index:'global',_type:'settings',_id:hit._id}});
				bulk.push(hit._source);

			})
			$scope.db.nuke().then(function(){
				$scope.utils.boot('global').then(function(data){
					$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
						err ? console.error(err):console.log(data);
						var count = 0;
						Object.keys(Yolk.modules).forEach(function(key){
							count++
							if(Yolk.modules[key].config && Yolk.modules[key].config.db_index){
								console.log(key)
								$scope.utils.boot(Yolk.modules[key].config.db_index)
							}
							if(count === Object.keys(Yolk.modules).length){
								setTimeout(function(){
									window.location.reload();
								},1000)
							}
						});
					})
				})
			})
		})
	}

	$scope.ctl = {
		handleDragStart:function(event,data){
			console.log(event)
		}
	}

}])
