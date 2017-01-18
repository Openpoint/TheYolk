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

	$scope.Sort = {};

	$scope.dims.update();
	$scope.lib={
		bios:{},
		tracks:[]
	};
	$scope.allTracks;

	//$scope.data_sources = ['local','jamendo','internetarchive','youtube','torrents'];
	//$scope.data_sources = ['local','internetarchive','youtube'];
	$scope.db.get('global.settings.'+mod_name).then(function(data){
		//$scope.pinned.sources = ['local','online'];
		//$scope.sources=$scope.data_sources;

		//$timeout(function(){
			$scope.settings = data;
			$scope.settings.paths.home = Yolk.home;
			$scope.settings.paths.root = Yolk.root;
			$scope.settings.paths.artists = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.artist_images);
			$scope.settings.paths.albums = path.join(Yolk.home,'data/modules',mod_name,Yolk.modules[mod_name].config.data.album_images);
			$scope.lib.noart = path.join(Yolk.root,'core/modules/musicPlayer/images/noImage.svg');
			$scope.search.go();
			$timeout(function(){
				$scope.settings_loaded = true;
			})
			//$scope.dbReady = true;
			//$scope.settings_loaded = true;
			//$scope.tracks.checkLocal('local');
			//todo - save state to db and restore on load

		//});

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



	//set the local music library location and scan files
	$scope.fileSelect= function(){
		dialog.showOpenDialog({properties: ['openDirectory']},function(Dir){
			$scope.settings.paths.musicDir = Dir[0];
			$scope.$apply();
			ipcRenderer.send('getDir', Dir[0]);
		})
	}

	$scope.lib.drawers = {};
	$scope.drawer = function(row){

		if(!$scope.lib.drawers[$scope.pin.Page]){
			$scope.lib.drawers[$scope.pin.Page]={};
		}
		if(!$scope.lib.drawers[$scope.pin.Page][row.id]){
			$scope.lib.drawers[$scope.pin.Page][row.id]={}
		}
		if($scope.lib.drawers[$scope.pin.Page][row.id].state){
			$scope.lib.drawers[$scope.pin.Page][row.id].state = false;
			$('#drawer'+row.id).height($('#drawer'+row.id+' .drawerInner').outerHeight());
			$timeout(function(){
				$('#drawer'+row.id).height(0);
			})

		}else{
			Object.keys($scope.lib.drawers[$scope.pin.Page]).forEach(function(key){
				if($scope.lib.drawers[$scope.pin.Page][key].state && key!== row.id){
					$scope.lib.drawers[$scope.pin.Page][key].state = false;
					$('#drawer'+key).height($('#drawer'+key+' .drawerInner').outerHeight());
					$timeout(function(){
						$('#drawer'+key).height(0);
					})
					$('#drawer'+key).height(0);
				}
			})
			$scope.lib.drawers[$scope.pin.Page][row.id].state = true;
			$('#drawer'+row.id).height(0);
			$scope.drawerContent(row).then(function(){
				var height = $('#drawer'+row.id+' .drawerInner').outerHeight();
				$('#drawer'+row.id).height(height);
			})
		}

	}
	$scope.drawerContent = function(row){
		switch($scope.pin.Page){
			case "artist":
				return new Q(function(resolve,reject){

					$scope.search.artistAlbums(row.name).then(function(data){
						if(data){
							var albums=[{
								id:'youtube',
								name:'Youtube',
								count:0
							}]
							var sort = {};
							data.forEach(function(track){
								if(track.type === 'youtube'){
									albums[0].count++
								}else if(track.album){
									if(!sort[track.album]){
										sort[track.album] = {
											count:1,
											name:track.metadata.album
										}
									}else{
										sort[track.album].count++
									}
								}
							})
							if(!albums[0].count){
								albums=[];
							}
							Object.keys(sort).sort(function(a,b){return sort[b].count-sort[a].count}).forEach(function(key){
								sort[key].id=key;
								albums.push(sort[key]);
							})
							$scope.lib.drawers[$scope.pin.Page][row.id].albums = albums;
							//row.albums = albums;
							$timeout(function(){
								resolve(true);
							})

						}
					});
				})
			break;
			case 'album':
				function update(key,key2,updated,title,id,name){
					$timeout(function(){
						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2] = updated;
						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2].title = title;

						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2].album = id;
						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2].metadata.album = name;
						$scope.lib.drawers[$scope.pin.Page][row.id].tracks[key][key2].filter={pos:-1}
					})
				}
				return new Q(function(resolve,reject){
					$scope.lib.drawers[$scope.pin.Page][row.id].tracks = row.tracks;
					Object.keys(row.tracks).forEach(function(key){
						Object.keys(row.tracks[key]).forEach(function(key2){
							$scope.search.albumTrack(row.tracks[key][key2],row.metadata).then(function(data){

								var types = {};
								data.forEach(function(track){
									if(!types[track.type]){
										types[track.type] = [];
									}
									types[track.type].push(track)
								})
								if(types.local){
									update(key,key2,types.local[0],row.tracks[key][key2].title,row.id,row.metadata.title)
								}else if(types.internetarchive){
									update(key,key2,types.internetarchive[0],row.tracks[key][key2].title,row.id,row.metadata.title)
								}else if(types.youtube){
									update(key,key2,types.youtube[0],row.tracks[key][key2].title,row.id,row.metadata.title)
								}
							})
						})

					})
					$timeout(function(){
						resolve(true);
					})

				})
			break;

		}
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
			switch($scope.pin.Page){
				case "artist":
					$scope.search.artist(false,true);
					break;
				case "album":
					$scope.search.album(false,true);
					break;
				default:
					$scope.search.go(false,true);
			}
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

	$scope.$watch('pin.Page',function(){
		$timeout(function(){

			if($scope.lib.playing && ($scope.pin.Page === 'artist' || $scope.pin.Page === 'album')){
				$scope.lib.playing.filter.pos=-1;
			}
		})


	})

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
			}else{
				$scope.goSearch = false;
			}
			$timeout.cancel(searchTime);
			searchTime = $timeout(function(){
				$scope.search.go();
			},500);
		}
	});

	$scope.$watch('lib.playing.filter.pos',function(oldVal,newVal){
		if(oldVal!==newVal){
			if($scope.lib.playing.filter.pos === -1){
				$('#playing .inner').css({
					position:'fixed',
					top:'auto',
					bottom:0
				}).addClass('Bottom').removeClass('Top');
			}
		}
	})
}])
