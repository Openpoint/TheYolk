'use strict';

angular.module('yolk').controller('musicPlayer', [
'$scope','$interval','$timeout','dims','utils','lazy','audio','internetarchive','youtube','tracks','drawers','search','pin','playlist',
function($scope,$interval,$timeout,dims,utils,lazy,audio,internetarchive,youtube,tracks,drawers,search,pin,playlist) {
	const mod_name = 'musicPlayer';
	//const {ipcRenderer} = require('electron');
	const {dialog} = require('electron').remote
	const defaults = require('../musicPlayer.js');
	const path = require('path');

	process.env.ELECTRON_ENV === 'development'?$scope.isdev = true:$scope.isdev = false;

	ipcRenderer.send('kill','revive');
	$scope.db_index = defaults.db_index.index;
	$scope.progress = {};
	$scope.Sortby = {};
	$scope.refresh = {};
	$scope.utils = new utils();
	$scope.db = $scope.utils.db;
	$scope.searchTerm = '';
	$scope.root = Yolk.root;

	$scope.audio = new audio($scope);
	$scope.pin = new pin($scope);
	$scope.playlist = new playlist($scope);
	$scope.lazy = new lazy($scope);
	$scope.tracks = new tracks($scope);
	$scope.drawers = new drawers($scope);
	$scope.internetarchive = new internetarchive($scope);
	$scope.youtube = new youtube($scope);
	$scope.dims = new dims($scope);
	$scope.search = new search($scope);

	$scope.countries = require('../lib/tools/countries.json');
	$scope.tools = require('../lib/tools/searchtools.js');
	$scope.ft = require(path.join(Yolk.root,'core/lib/filetools.js'));
	$scope.Sort = {};
	$scope.dims.update();

	$scope.lib={
		bios:{},
		tracks:[],
		padding:0
	};
	$scope.allTracks;

	$scope.db.get('global.settings.'+mod_name).then(function(data){
		$scope.settings = data;
		$scope.settings.paths.home = Yolk.home;
		$scope.settings.paths.root = Yolk.root;
		$scope.settings.paths.artist = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.artist_images);
		$scope.settings.paths.album = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.album_images);
		$scope.lib.noart = path.join(Yolk.root,'core/modules/musicPlayer/images/noImage.svg');
		$scope.search.go(true,'init');
		$scope.$apply(function(){
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
			if($scope.ft.isThere('file',Path)){
				return Path;
			}else{
				return 'core/modules/musicPlayer/images/noImage.svg';
			}
		}else{
			return 'core/modules/musicPlayer/images/noImage.svg';
		}

	}
	$scope.dev=function(info,type){
		console.log(info.filter)
		$scope.db.client.get({index:$scope.db_index,type:type,id:info.id},function(err,data){
			console.info('-------------------------------------------------------------------------------------------------');
			if(data._source.metadata){
				Object.keys(data._source.metadata).forEach(function(key){
					console.log(key+': '+data._source.metadata[key])
				})
			}
			console.info(data._source)
			console.info('-------------------------------------------------------------------------------------------------');
		})
		return;
		if($scope.dims.dev){
			$scope.dims.dev = false;
		}else{
			$scope.dims.dev = true;
		}
	}



	//set the local music library location and scan files
	$scope.fileSelect= function(){
		dialog.showOpenDialog({properties: ['openDirectory']},function(Dir){
			if(!Dir || !Dir.length) return;
			$scope.settings.paths.musicDir = Dir[0];
			$scope.$apply();
			ipcRenderer.send('getDir', Dir[0]);
		})
	}


	var refresh_time = false;
	if(!ipcRenderer._events.refresh){
		ipcRenderer.on('refresh',function(event,data){
			if(data  === 'bulk'){
				$scope.refresh.title?$scope.refresh.title++:$scope.refresh.title=1
				$scope.refresh.album?$scope.refresh.album++:$scope.refresh.album=1
				$scope.refresh.artist?$scope.refresh.artist++:$scope.refresh.artist=1
			}else{
				$scope.refresh[data]?$scope.refresh[data]++:$scope.refresh[data]=1
			}
			if(refresh_time) return;
			refresh_time = setTimeout(function(){
				$scope.search.go(true);
				refresh_time = false;
			},3000)
		});
	}
	if(!ipcRenderer._events.progress){
		ipcRenderer.on('progress',function(event,data){
			if(data.type === 'musicbrainz') $scope.musicbrainz = data.size;
		});
	}
	if(!ipcRenderer._events.verify){
		ipcRenderer.on('verify',function(event,data){
			console.log('verify');
			console.log(data);
			//$scope.tracks.verify(data);
		});
	}
	if(!ipcRenderer._events.albums){
		ipcRenderer.on('albums',function(event,data){
			$scope.search.go(true);
		});
	}
	if(!ipcRenderer._events.refreshart){
		ipcRenderer.on('refreshart',function(event){
			var p = $scope.pin.Page;
			$scope.$apply(function(){
				$scope.pin.Page = false;
			})
			$timeout(function(){
				$scope.pin.Page = p;
			})
		});
	}
	$('#search').click(function(){
		$('#search input').focus();
	})

	$interval(function(){
		if($scope.progress.internetarchive !== $scope.internetarchive.progress||$scope.progress.youtube !== $scope.youtube.progress||$scope.progress.musicbrainz !== $scope.musicbrainz){
			$scope.progress.internetarchive = $scope.internetarchive.progress;
			$scope.progress.youtube = $scope.youtube.progress;
			$scope.progress.musicbrainz = $scope.musicbrainz;
		}
	},1000)

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
			clearTimeout(searchTime);
			if($scope.searchNow){
				$scope.searchNow = false;
				if($scope.searchNow === 'skip') return;
				$scope.search.go(false,'searchterm');
			}else{
				searchTime = setTimeout(function(){
					$scope.search.go(false,'searchterm');
				},500);
			}
		}
	});
	$scope.albums = function(){
		ipcRenderer.send('albums');
	}
	$scope.refreshart = function(data){
		$scope.db.client.get({index:$scope.db_index,type:data.type,id:data.id},function(err,data){
			if(err){
				console.error(err);
				return;
			}

			var track = data._source;
			var data = {
				id:track.id,
				type:track.type,
				name:track.type==='album'?track.metadata.title:track.name,
				artist:track.type==='album'?track.metadata.artist:false,
				coverart:track.links.coverart,
				discogs:track.links.discogs,
				images:track.links.images||[],
				refresh:true
			}
			ipcRenderer.send('refreshart',data);
		})
	}
	$scope.stop = function(){
		$scope.internetarchive.kill();
		$scope.youtube.kill();
		ipcRenderer.send('kill');
		setTimeout(function(){
			ipcRenderer.send('kill','revive');
		})
	}
	//for development purposes - destroy the database and reload
	$scope.nuke=function(){

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
}])
